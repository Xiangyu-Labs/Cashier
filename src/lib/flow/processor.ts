import { Job } from 'bullmq';
import { getFlowTaskHandler } from './registry';
import { FlowContext, FlowDefinition } from './types';
import { completeTaskRun, failTaskRun } from './task-run-service';
import { logger } from '@/lib/logger';
import { flowProducer } from './workers';

export async function processJob(job: Job): Promise<unknown> {
    const handler = getFlowTaskHandler(job.name);
    if (!handler) {
        throw new Error(`No handler registered for: ${job.name}`);
    }

    const context: FlowContext = {
        jobId: job.id!,
        taskRunId: job.data.__taskRunId,
        ledgerId: job.data.__ledgerId,
        updateProgress: async (progress) => {
            await job.updateProgress(progress);
            if (job.data.__taskRunId) {
                // Optional: update DB if column exists
            }
        },
        recordUsage: async (usage) => {
            if (job.data.__taskRunId) {
                const { recordTaskRunUsage } = await import('./task-run-service');
                await recordTaskRunUsage(job.data.__taskRunId, usage);
            }
        },
        isCancelled: async () => {
            const state = await job.getState();
            return state === 'failed' || state === 'unknown';
        },
    };

    try {
        let result: unknown;

        // 0. Check for Resumption (Fan-in)
        if (job.data.__resuming) {
            const childrenValues = await job.getChildrenValues();
            const results = Object.values(childrenValues);

            if (handler.onChildrenCompleted) {
                result = await handler.onChildrenCompleted(results, context);
            } else {
                result = results; // Default: return array of children results
            }
        } else {
            // 1. Validate (First Run)
            if (handler.validate) {
                await handler.validate(job.data, context);
            }

            // 2. Execute (Fan-out / Exploration)
            result = await handler.execute(job.data, context);

            // 3. Check for Recursion
            if (isFlowDefinition(result)) {
                // Setup children
                const childrenDef = (result.children || []).map(child => ({
                    name: child.name,
                    queueName: child.queueName,
                    data: { ...child.data, __taskRunId: job.data.__taskRunId, __ledgerId: job.data.__ledgerId },
                    opts: { ...child.opts, parent: { id: job.id!, queue: job.queueQualifiedName } }
                }));

                // Add children to queue
                for (const child of childrenDef) {
                    await flowProducer.add(child);
                }

                // Mark as resuming and suspend
                await job.updateData({ ...job.data, __resuming: true });
                await job.moveToWaitingChildren(job.token!);

                // Stop processing this run
                return;
            }
        }

        // 4. Final Completion (Root Task)
        if (isRootJob(job) && handler.onComplete) {
            await handler.onComplete(result, job.data, context); // Pass input (job.data)
            await completeTaskRun(job.data.__taskRunId, result);
        }

        return result;

    } catch (error) {
        if (isRootJob(job)) {
            if (handler.onError) {
                // If onError throws (e.g., UnrecoverableError), we want THAT error to propagate
                // to BullMQ instead of the original error.
                await handler.onError(error as Error, job.data, context);
            }
            await failTaskRun(job.data.__taskRunId, (error as Error).message);
        }
        throw error;
    }
}

function isFlowDefinition(result: unknown): result is FlowDefinition {
    return typeof result === 'object' && result !== null && 'name' in result && 'title' in result;
}

function isRootJob(job: Job): boolean {
    return !!job.data.__taskRunId && !job.parent;
}
