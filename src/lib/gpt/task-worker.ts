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
import { encode } from "gpt-tokenizer";


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
 * Deeply removes 'images' and 'imageUrls' fields from an object to prevent tokenizing Base64 data.
 */
function scrubImages(obj: unknown): unknown {
    if (Array.isArray(obj)) {
        return obj.map(scrubImages);
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: Record<string, unknown> = {};
        const typedObj = obj as Record<string, unknown>;
        for (const key in typedObj) {
            if (key === 'images' || key === 'imageUrls') {
                continue;
            }
            newObj[key] = scrubImages(typedObj[key]);
        }
        return newObj;
    }
    return obj;
}

/**
 * Calculate token usage using gpt-tokenizer.
 * Robustly handles objects and stringified JSON by excluding large Base64 image data.
 */
function calculateTokenUsage(input: unknown, output: unknown): { inputTokens: number, outputTokens: number, totalTokens: number } {
    let inputTokens = 0;
    let inputObj = input;
    let imageCount = 0;

    // Handle stringified JSON
    if (typeof input === "string" && (input.trim().startsWith("{") || input.trim().startsWith("["))) {
        try {
            inputObj = JSON.parse(input);
        } catch {
            // Not valid JSON
        }
    }

    if (typeof inputObj === "string") {
        inputTokens = encode(inputObj).length;
    } else if (inputObj && typeof inputObj === "object") {
        const msgInput = inputObj as Record<string, unknown>;

        // 1. Count images before scrubbing
        function countImagesRecursive(obj: unknown): number {
            if (Array.isArray(obj)) {
                return obj.reduce((sum, item) => sum + countImagesRecursive(item), 0);
            }
            if (obj !== null && typeof obj === 'object') {
                const typedObj = obj as Record<string, unknown>;
                let count = 0;
                if (Array.isArray(typedObj.images)) count += typedObj.images.length;
                if (Array.isArray(typedObj.imageUrls)) count += typedObj.imageUrls.length;
                for (const key in typedObj) {
                    if (key !== 'images' && key !== 'imageUrls') {
                        count += countImagesRecursive(typedObj[key]);
                    }
                }
                return count;
            }
            return 0;
        }
        imageCount = countImagesRecursive(msgInput);

        // 2. Scrub and tokenize text
        const scrubbed = scrubImages(msgInput);
        const textToTokenize = JSON.stringify(scrubbed);
        inputTokens = encode(textToTokenize).length;

        // 3. Add image estimate (1105 per image)
        inputTokens += imageCount * 1105;
    }

    const outputText = typeof output === "string" ? output : JSON.stringify(output);
    const outputTokens = encode(outputText).length;

    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}
