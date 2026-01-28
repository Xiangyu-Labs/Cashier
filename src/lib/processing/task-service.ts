// Processing Task Service
// CRUD operations for processing tasks

import { db } from "@/lib/db";
import { processingTasks } from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { CreateProcessingTaskParams, ProcessingTask, ProcessingTaskStatus, ProcessingTaskProgress } from "./types";
import { logger } from "@/lib/logger";

// Lazy import to avoid circular dependency with task-worker
async function triggerQueueProcessing(): Promise<void> {
    const { processTaskQueue } = await import("./task-worker");
    processTaskQueue().catch((err: Error) => {
        logger.error({ err }, "Failed to trigger task queue processing");
    });
}

/**
 * Create a new processing task and trigger queue processing.
 */
export async function createProcessingTask(params: CreateProcessingTaskParams): Promise<{ taskId: string }> {
    const [task] = await db.insert(processingTasks).values({
        type: params.type,
        title: params.title,
        ledgerId: params.ledgerId,
        entityId: params.entityId,
        entityType: params.entityType,
        input: params.input,
        metadata: params.metadata,
        status: "queued",
    }).returning({ id: processingTasks.id });

    // Trigger worker (non-blocking)
    triggerQueueProcessing();

    return { taskId: task.id };
}

/**
 * Get a processing task by ID.
 */
export async function getProcessingTask(taskId: string): Promise<ProcessingTask | null> {
    const task = await db.query.processingTasks.findFirst({
        where: eq(processingTasks.id, taskId),
    });
    return task ? mapToProcessingTask(task) : null;
}

/**
 * Get recent processing tasks for a ledger.
 */
export async function getRecentProcessingTasks(ledgerId: string, limit = 20): Promise<ProcessingTask[]> {
    const tasks = await db.query.processingTasks.findMany({
        where: eq(processingTasks.ledgerId, ledgerId),
        orderBy: [desc(processingTasks.createdAt)],
        limit,
    });
    return tasks.map(mapToProcessingTask);
}

/**
 * Get processing tasks by status.
 */
export async function getProcessingTasksByStatus(
    ledgerId: string,
    statuses: ProcessingTaskStatus[]
): Promise<ProcessingTask[]> {
    const tasks = await db.query.processingTasks.findMany({
        where: and(
            eq(processingTasks.ledgerId, ledgerId),
            inArray(processingTasks.status, statuses)
        ),
        orderBy: [desc(processingTasks.createdAt)],
    });
    return tasks.map(mapToProcessingTask);
}

/**
 * Get active processing tasks (queued or running) for a ledger.
 */
export async function getActiveProcessingTasks(ledgerId: string): Promise<ProcessingTask[]> {
    return getProcessingTasksByStatus(ledgerId, ["queued", "running"]);
}

/**
 * Update processing task status to running.
 */
export async function markProcessingTaskRunning(taskId: string): Promise<void> {
    await db.update(processingTasks)
        .set({
            status: "running",
            startedAt: new Date(),
        })
        .where(eq(processingTasks.id, taskId));
}

/**
 * Update processing task status to completed.
 */
export async function markProcessingTaskCompleted(taskId: string, output: unknown, metadata?: Record<string, unknown>): Promise<void> {
    await db.update(processingTasks)
        .set({
            status: "completed",
            output,
            completedAt: new Date(),
            ...(metadata ? { metadata } : {}),
        })
        .where(eq(processingTasks.id, taskId));
}

/**
 * Update processing task status to failed.
 */
export async function markProcessingTaskFailed(taskId: string, error: string): Promise<void> {
    await db.update(processingTasks)
        .set({
            status: "failed",
            error,
            completedAt: new Date(),
        })
        .where(eq(processingTasks.id, taskId));
}

/**
 * Update processing task progress.
 */
export async function updateProcessingTaskProgress(taskId: string, progress: ProcessingTaskProgress): Promise<void> {
    await db.update(processingTasks)
        .set({ progress })
        .where(eq(processingTasks.id, taskId));
}

/**
 * Atomically claim the next queued task for processing.
 * Uses 'FOR UPDATE SKIP LOCKED' to prevent multiple workers from picking the same task.
 */
export async function claimNextProcessingTask(): Promise<ProcessingTask | null> {
    return await db.transaction(async (tx) => {
        // Find the next queued task and lock it
        const [task] = await tx
            .select()
            .from(processingTasks)
            .where(eq(processingTasks.status, "queued"))
            .orderBy(processingTasks.createdAt)
            .limit(1)
            .for("update", { skipLocked: true });

        if (!task) return null;

        // Mark as running immediately within the same transaction
        const [updated] = await tx
            .update(processingTasks)
            .set({
                status: "running",
                startedAt: new Date(),
            })
            .where(eq(processingTasks.id, task.id))
            .returning();

        return mapToProcessingTask(updated);
    });
}

/**
 * Get the next queued processing task (FIFO).
 * @deprecated Use claimNextProcessingTask() for multi-worker support.
 */
export async function getNextQueuedProcessingTask(): Promise<ProcessingTask | null> {
    const task = await db.query.processingTasks.findFirst({
        where: eq(processingTasks.status, "queued"),
        orderBy: [processingTasks.createdAt], // ASC for FIFO
    });
    return task ? mapToProcessingTask(task) : null;
}

/**
 * Get all processing tasks in running state (for recovery).
 */
export async function getRunningProcessingTasks(): Promise<ProcessingTask[]> {
    const tasks = await db.query.processingTasks.findMany({
        where: eq(processingTasks.status, "running"),
    });
    return tasks.map(mapToProcessingTask);
}

// Helper to map DB row to ProcessingTask type
function mapToProcessingTask(row: typeof processingTasks.$inferSelect): ProcessingTask {
    return {
        ...row,
        status: row.status as ProcessingTaskStatus,
        progress: row.progress as ProcessingTaskProgress | null,
        metadata: row.metadata as Record<string, unknown> | null,
    };
}
