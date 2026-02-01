import { Job, WaitingChildrenError } from 'bullmq';
import { getFlowTaskHandler } from '@/lib/flow/registry';
import { FlowContext, FlowDefinition } from '@/lib/flow/types';
import { completeTaskRun, failTaskRun } from '@/lib/flow/task-run-service';
import { logger as _logger } from '@/lib/logger';
import { getFlowProducer } from '@/lib/flow/workers';

import { withAIContext } from '@/lib/ai/ai-context';
import { db } from '@/lib/db';
import { taskRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function processJob(job: Job): Promise<unknown> {
    const handler = getFlowTaskHandler(job.name);
    if (!handler) {
        throw new Error(`No handler registered for: ${job.name}`);
    }

    // 🔒 SECURITY: Verify task ownership from database
    // Never trust job.data.__ledgerId directly - always validate against database
    const { __taskRunId, __ledgerId } = job.data;

    if (__taskRunId) {
        // Query the real taskRun from database
        const taskRun = await db.query.taskRuns.findFirst({
            where: eq(taskRuns.id, __taskRunId),
            columns: { ledgerId: true, status: true }
        });

        // Validate task exists
        if (!taskRun) {
            throw new Error(`[Security] Task run ${__taskRunId} not found in database`);
        }

        // Validate ledgerId matches
        if (taskRun.ledgerId !== __ledgerId) {
            throw new Error(
                `[Security] LedgerId mismatch for task ${__taskRunId}: ` +
                `expected ${taskRun.ledgerId}, got ${__ledgerId}. ` +
                `Possible payload tampering detected.`
            );
        }

        // Prevent re-execution of completed tasks
        if (taskRun.status === 'completed') {
            _logger.warn(`Task ${__taskRunId} already completed, skipping execution`);
            return; // Return early, don't process
        }

        // Also skip if already failed (unless we want retry logic)
        if (taskRun.status === 'failed') {
            _logger.warn(`Task ${__taskRunId} already failed, skipping execution`);
            return;
        }
    }

    // Use validated ledgerId from database verification above (if taskRunId exists)
    // Otherwise use the payload value (for non-tracked jobs, if any)
    const validatedLedgerId = job.data.__ledgerId;

    const context: FlowContext = {
        jobId: job.id!,
        taskRunId: job.data.__taskRunId,
        ledgerId: validatedLedgerId,
        updateProgress: async (progress) => {
            await job.updateProgress(progress);
            if (job.data.__taskRunId) {
                // Optional: update DB if column exists
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
                // Wrap in context just in case (though resuming usually doesn't call AI immediately without new execute)
                // But safer to wrap
                // Use validatedLedgerId to ensure we're using the verified value
                result = await withAIContext(job.data.__taskRunId || 'unknown', validatedLedgerId || '', async () => {
                    return handler.onChildrenCompleted!(results, context);
                });
            } else {
                result = results; // Default: return array of children results
            }
        } else {
            // 1. Validate (First Run)
            if (handler.validate) {
                await handler.validate(job.data, context);
            }

            // 2. Execute (Fan-out / Exploration)
            // Wrap in AI Context
            // Use validatedLedgerId to ensure we're using the verified value
            result = await withAIContext(job.data.__taskRunId || 'unknown', validatedLedgerId || '', async () => {
                return handler.execute(job.data, context);
            });

            // 3. Check for Recursion
            if (isFlowDefinition(result)) {
                // Setup children
                // 🔒 SECURITY: Pass validated ledgerId to children tasks
                const childrenDef = (result.children || []).map(child => ({
                    name: child.name,
                    queueName: child.queueName,
                    data: { ...(child.data as Record<string, unknown>), __taskRunId: job.data.__taskRunId, __ledgerId: validatedLedgerId },
                    opts: { ...child.opts, parent: { id: job.id!, queue: job.queueQualifiedName } }
                }));

                // Add children to queue
                for (const child of childrenDef) {
                    await getFlowProducer().add(child);
                }

                // Mark as resuming and suspend
                await job.updateData({ ...job.data, __resuming: true });
                await job.moveToWaitingChildren(job.token!);

                // Stop processing this run
                throw new WaitingChildrenError();
            }
        }

        // 4. Final Completion (Root Task)
        if (isRootJob(job) && handler.onComplete) {
            await handler.onComplete(result, job.data, context); // Pass input (job.data)
            // Use validatedLedgerId for completion
            await completeTaskRun(job.data.__taskRunId, result, validatedLedgerId);
        }

        return result;

    } catch (error) {
        // Don't mark as failed if we are just suspending for children
        if (error instanceof WaitingChildrenError || (error as Error).name === 'WaitingChildrenError') {
            throw error;
        }

        if (isRootJob(job)) {
            if (handler.onError) {
                // If onError throws (e.g., UnrecoverableError), we want THAT error to propagate
                // to BullMQ instead of the original error.
                await handler.onError(error as Error, job.data, context);
            }
            // Use validatedLedgerId for failure recording
            await failTaskRun(job.data.__taskRunId, (error as Error).message, validatedLedgerId);
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
