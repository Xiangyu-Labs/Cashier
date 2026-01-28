
import { claimNextProcessingTask } from "@/lib/processing/task-service";
import { getProcessingTaskHandler } from "@/lib/processing/task-registry";
import { ProcessingTaskExecutionContext, ProcessingTaskProgress } from "@/lib/processing/types";
import { markProcessingTaskCompleted, markProcessingTaskFailed, updateProcessingTaskProgress } from "@/lib/processing/task-service";

/**
 * Synchronously processes all currently queued tasks.
 * Useful for integration tests where we want to wait for processing to finish.
 */
export async function processAllPendingTasks() {
    let task = await claimNextProcessingTask();
    while (task) {
        const handler = getProcessingTaskHandler(task.type);
        if (!handler) {
            await markProcessingTaskFailed(task.id, `No handler for ${task.type}`);
        } else {
            try {
                const context: ProcessingTaskExecutionContext = {
                    updateProgress: async (p: ProcessingTaskProgress) => {
                        await updateProcessingTaskProgress(task!.id, p);
                    },
                    getProgress: () => task!.progress,
                };
                const output = await handler.execute(task, context);
                if (handler.onComplete) {
                    await handler.onComplete(output, task);
                }
                await markProcessingTaskCompleted(task.id, output);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (handler.onError) {
                    await handler.onError(error instanceof Error ? error : new Error(msg), task);
                }
                await markProcessingTaskFailed(task.id, msg);
            }
        }
        task = await claimNextProcessingTask();
    }
}
