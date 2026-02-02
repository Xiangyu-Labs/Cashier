import { getFlowTaskHandler } from '@/lib/flow/registry';
import { FlowContext, FlowDefinition } from '@/lib/flow/types';
import { completeTaskRun, failTaskRun } from '@/features/tasks/server/services/task-run-service';
import { logger } from '@/lib/logger';
import { withAIContext } from '@/features/ai/server/ai-context';
import { db } from '@/lib/db';
import { taskRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Execute a task flow in-process (asynchronously).
 * This replaces the BullMQ worker processor.
 */
export async function runTask(taskDef: FlowDefinition): Promise<void> {
    const { name, data } = taskDef;
    const taskInput = data as Record<string, unknown> & { __taskRunId?: string; __ledgerId?: string };
    const taskRunId = taskInput?.__taskRunId as string | undefined;
    const ledgerId = taskInput?.__ledgerId as string | undefined;

    // Create a unique job ID for this execution (since we don't have BullMQ job IDs anymore)
    const jobId = `job_${uuidv4()}`;

    // 1. Resolve Handler
    const handler = getFlowTaskHandler(name);
    if (!handler) {
        logger.error({ taskName: name }, "No handler registered for task");
        if (taskRunId && ledgerId) {
            await failTaskRun(taskRunId, `No handler registered for task: ${name}`, ledgerId);
        }
        return;
    }

    // 2. Prepare Context
    const context: FlowContext = {
        jobId,
        taskRunId,
        ledgerId,
        updateProgress: async (progress) => {
            // In-memory update logs could go here
            // Since we removed the job.updateProgress, we might just log or ignore
            logger.debug({ taskRunId, progress }, "Task progress update");
        },
        isCancelled: async () => false, // Simplification: No cancellation support for now in simple runner
    };

    // 3. Execution Wrapper
    // Run this asynchronously so we don't block the caller (if they didn't await us)
    // However, the caller of runTask usually *waits* for the dispatch, not the result.
    // So we will wrap the execution in a floating promise if not awaited, 
    // but here we define the execution logic.

    logger.info({ taskName: name, taskRunId }, "Starting in-process task execution");

    try {
        // --- Security / Validation Check (Same as processor.ts) ---
        if (taskRunId) {
            const taskRun = await db.query.taskRuns.findFirst({
                where: eq(taskRuns.id, taskRunId),
                columns: { ledgerId: true, status: true }
            });

            if (!taskRun) {
                logger.error({ taskRunId }, "Task run not found in DB");
                return;
            }
            if (taskRun.ledgerId !== ledgerId) {
                logger.error({ taskRunId, expected: taskRun.ledgerId, actual: ledgerId }, "Security mismatch in task execution");
                return;
            }
            if (taskRun.status === 'completed' || taskRun.status === 'failed') {
                logger.info({ taskRunId, status: taskRun.status }, "Task already finished, skipping");
                return;
            }
        }

        // --- Step 1: Validate ---
        if (handler.validate) {
            await handler.validate(taskInput, context);
        }

        // Wrap in AI Context
        const result = await withAIContext(taskRunId || 'unknown', ledgerId || '', async () => {
            return handler.execute(taskInput as unknown, context);
        });

        // --- Step 3: Handle Recursion / Children (Mock implementation) ---
        // If the result is a FlowDefinition (child task), we need to execute it recursively.
        // For existing tasks (Process Document, Generate Metadata), we don't strictly use recursion 
        // in a way that requires pausing the parent. 
        // The current `parse-source-document` does NOT return a FlowDefinition, it returns the output directly.
        // So for the current scope, we can simplify this. 
        // If we need recursion later, we can implement `if (isFlowDefinition(result)) { ... }`

        // --- Step 4: Complete ---
        if (handler.onComplete) {
            await handler.onComplete(result, taskInput, context);
        }

        // Update DB status
        if (taskRunId && ledgerId) {
            await completeTaskRun(taskRunId, result, ledgerId);
        }

        logger.info({ taskName: name, taskRunId }, "Task execution completed successfully");

    } catch (error) {
        logger.error({ taskName: name, taskRunId, error }, "Task execution failed");

        // Call onError handler
        if (handler.onError) {
            try {
                await handler.onError(error as Error, taskInput as unknown, context);
            } catch (handlerError) {
                logger.error({ error: handlerError }, "Error in task onError handler");
            }
        }

        // Update DB status
        if (taskRunId && ledgerId) {
            await failTaskRun(taskRunId, (error as Error).message, ledgerId);
        }
    }
}
