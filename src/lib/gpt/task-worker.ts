// GPT Task Worker
// Executes queued tasks with progress tracking

import { GptTask, TaskProgress, TaskExecutionContext } from "./types";
import { getTaskHandler } from "./task-registry";
import {
    getNextQueuedTask,
    markTaskRunning,
    markTaskCompleted,
    markTaskFailed,
    updateTaskProgress,
    getTask,
} from "./task-service";

let isProcessing = false;

/**
 * Process the task queue. 
 * This is the main entry point for task execution.
 * Only one worker runs at a time (serial processing).
 */
export async function processTaskQueue(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    try {
        let task = await getNextQueuedTask();
        while (task) {
            await executeTask(task);
            task = await getNextQueuedTask();
        }
    } finally {
        isProcessing = false;
    }
}

/**
 * Execute a single task.
 */
async function executeTask(task: GptTask): Promise<void> {
    const handler = getTaskHandler(task.type);

    if (!handler) {
        await markTaskFailed(task.id, `No handler registered for task type: ${task.type}`);
        return;
    }

    await markTaskRunning(task.id);

    // Create execution context
    const context: TaskExecutionContext = {
        updateProgress: async (progress: TaskProgress) => {
            await updateTaskProgress(task.id, progress);
        },
        getProgress: () => task.progress,
    };

    try {
        console.log(`Task ${task.id} (${task.type}): Starting execution`);

        const output = await handler.execute(task, context);

        // Call completion handler if defined
        if (handler.onComplete) {
            await handler.onComplete(output, task);
        }

        await markTaskCompleted(task.id, output);
        console.log(`Task ${task.id} (${task.type}): Completed successfully`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Task ${task.id} (${task.type}): Failed with error:`, errorMessage);

        // Call error handler if defined (best-effort notification)
        if (handler.onError) {
            try {
                await handler.onError(error instanceof Error ? error : new Error(errorMessage), task);
            } catch (handlerError) {
                console.error(`Task ${task.id}: onError handler failed:`, handlerError);
            }
        }

        await markTaskFailed(task.id, errorMessage);
    }
}

/**
 * Check if the worker is currently processing tasks.
 */
export function isWorkerProcessing(): boolean {
    return isProcessing;
}
