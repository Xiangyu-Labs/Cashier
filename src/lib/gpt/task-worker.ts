// GPT Task Worker
// Executes queued tasks with progress tracking

import { GptTask, TaskProgress, TaskExecutionContext } from "./types";
import { getTaskHandler } from "./task-registry";
import {
    claimNextTask,
    markTaskCompleted,
    markTaskFailed,
    updateTaskProgress,
    getTask,
} from "./task-service";
import { logger } from "@/lib/logger";

const N_WORKERS = parseInt(process.env.GPT_WORKER_COUNT || "1", 10);
let runningWorkers = 0;

/**
 * Process the task queue. 
 * Launches multiple worker loops according to N_GPT_WORKERS env variable.
 */
export async function processTaskQueue(): Promise<void> {
    // Fill up the worker pool to N_WORKERS
    while (runningWorkers < N_WORKERS) {
        spawnWorker();
    }
}

/**
 * Spawn a single persistent worker loop.
 */
async function spawnWorker(): Promise<void> {
    runningWorkers++;
    logger.info({ runningWorkers, totalWorkers: N_WORKERS }, "[GPT Worker] Instance started");

    try {
        let task = await claimNextTask();
        while (task) {
            await executeTask(task);
            task = await claimNextTask();
        }
    } catch (err) {
        logger.error({ err }, "[GPT Worker] Critical loop error");
    } finally {
        runningWorkers--;
        logger.info({ runningWorkers }, "[GPT Worker] Instance finished");
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

    // Status is already marked as 'running' by claimNextTask()

    // Create execution context
    const context: TaskExecutionContext = {
        updateProgress: async (progress: TaskProgress) => {
            // Re-verify task still exists and is not cancelled before updating progress
            const currentTask = await getTask(task.id);
            if (!currentTask || currentTask.status === "cancelled") {
                throw new Error("Task was cancelled or deleted");
            }
            await updateTaskProgress(task.id, progress);
        },
        getProgress: () => task.progress,
    };

    try {
        logger.info({ taskId: task.id, taskType: task.type }, "Starting task execution");

        const output = await handler.execute(task, context);

        // FINAL CHECK: Re-verify task status BEFORE calling onComplete/markTaskCompleted
        const finalTaskCheck = await getTask(task.id);
        if (!finalTaskCheck || finalTaskCheck.status === "cancelled") {
            logger.info({ taskId: task.id, taskType: task.type }, "Task cancelled or deleted during execution, skipping completion");
            return;
        }

        // Call completion handler if defined
        if (handler.onComplete) {
            await handler.onComplete(output, task);
        }

        // Merge with existing metadata
        const metadata = {
            ...(task.metadata || {}),
            usage: calculateTokenUsage(task.input, output)
        };

        await markTaskCompleted(task.id, output, metadata);
        logger.info({ taskId: task.id, taskType: task.type }, "Task completed successfully");

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error, taskId: task.id, taskType: task.type }, "Task failed with error");

        // Call error handler if defined (best-effort notification)
        if (handler.onError) {
            try {
                await handler.onError(error instanceof Error ? error : new Error(errorMessage), task);
            } catch (handlerError) {
                logger.error({ handlerError, taskId: task.id }, "onError handler failed");
            }
        }

        await markTaskFailed(task.id, errorMessage);
    }
}

/**
 * Check if the worker is currently processing tasks.
 */
export function isWorkerProcessing(): boolean {
    return runningWorkers > 0;
}

/**
 * Calculate token usage (General estimation: 1 token ~= 4 chars)
 */
function calculateTokenUsage(input: unknown, output: unknown): { inputTokens: number, outputTokens: number, totalTokens: number } {
    const inputTokens = Math.ceil(JSON.stringify(input).length / 4);
    const outputTokens = Math.ceil(JSON.stringify(output).length / 4);
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
    };
}
