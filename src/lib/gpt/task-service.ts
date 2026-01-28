// GPT Task Service
// CRUD operations for GPT tasks

import { db } from "@/lib/db";
import { gptTasks } from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { CreateTaskParams, GptTask, TaskStatus, TaskProgress } from "./types";
import { logger } from "@/lib/logger";

// Lazy import to avoid circular dependency with task-worker
async function triggerQueueProcessing(): Promise<void> {
    const { processTaskQueue } = await import("./task-worker");
    processTaskQueue().catch((err: Error) => {
        logger.error({ err }, "Failed to trigger task queue processing");
    });
}

/**
 * Create a new GPT task and trigger queue processing.
 */
export async function createTask(params: CreateTaskParams): Promise<{ taskId: string }> {
    const [task] = await db.insert(gptTasks).values({
        type: params.type,
        title: params.title,
        ledgerId: params.ledgerId,
        entityId: params.entityId,
        entityType: params.entityType,
        input: params.input,
        metadata: params.metadata,
        status: "queued",
    }).returning({ id: gptTasks.id });

    // Trigger worker (non-blocking)
    triggerQueueProcessing();

    return { taskId: task.id };
}

/**
 * Get a task by ID.
 */
export async function getTask(taskId: string): Promise<GptTask | null> {
    const task = await db.query.gptTasks.findFirst({
        where: eq(gptTasks.id, taskId),
    });
    return task ? mapToGptTask(task) : null;
}

/**
 * Get recent tasks for a ledger.
 */
export async function getRecentTasks(ledgerId: string, limit = 20): Promise<GptTask[]> {
    const tasks = await db.query.gptTasks.findMany({
        where: eq(gptTasks.ledgerId, ledgerId),
        orderBy: [desc(gptTasks.createdAt)],
        limit,
    });
    return tasks.map(mapToGptTask);
}

/**
 * Get tasks by status.
 */
export async function getTasksByStatus(
    ledgerId: string,
    statuses: TaskStatus[]
): Promise<GptTask[]> {
    const tasks = await db.query.gptTasks.findMany({
        where: and(
            eq(gptTasks.ledgerId, ledgerId),
            inArray(gptTasks.status, statuses)
        ),
        orderBy: [desc(gptTasks.createdAt)],
    });
    return tasks.map(mapToGptTask);
}

/**
 * Get active tasks (queued or running) for a ledger.
 */
export async function getActiveTasks(ledgerId: string): Promise<GptTask[]> {
    return getTasksByStatus(ledgerId, ["queued", "running"]);
}

/**
 * Update task status to running.
 */
export async function markTaskRunning(taskId: string): Promise<void> {
    await db.update(gptTasks)
        .set({
            status: "running",
            startedAt: new Date(),
        })
        .where(eq(gptTasks.id, taskId));
}

/**
 * Update task status to completed.
 */
export async function markTaskCompleted(taskId: string, output: unknown, metadata?: Record<string, unknown>): Promise<void> {
    await db.update(gptTasks)
        .set({
            status: "completed",
            output,
            completedAt: new Date(),
            ...(metadata ? { metadata } : {}),
        })
        .where(eq(gptTasks.id, taskId));
}

/**
 * Update task status to failed.
 */
export async function markTaskFailed(taskId: string, error: string): Promise<void> {
    await db.update(gptTasks)
        .set({
            status: "failed",
            error,
            completedAt: new Date(),
        })
        .where(eq(gptTasks.id, taskId));
}

/**
 * Update task progress.
 */
export async function updateTaskProgress(taskId: string, progress: TaskProgress): Promise<void> {
    await db.update(gptTasks)
        .set({ progress })
        .where(eq(gptTasks.id, taskId));
}

/**
 * Atomically claim the next queued task for processing.
 * Uses 'FOR UPDATE SKIP LOCKED' to prevent multiple workers from picking the same task.
 */
export async function claimNextTask(): Promise<GptTask | null> {
    return await db.transaction(async (tx) => {
        // Find the next queued task and lock it
        const [task] = await tx
            .select()
            .from(gptTasks)
            .where(eq(gptTasks.status, "queued"))
            .orderBy(gptTasks.createdAt)
            .limit(1)
            .for("update", { skipLocked: true });

        if (!task) return null;

        // Mark as running immediately within the same transaction
        const [updated] = await tx
            .update(gptTasks)
            .set({
                status: "running",
                startedAt: new Date(),
            })
            .where(eq(gptTasks.id, task.id))
            .returning();

        return mapToGptTask(updated);
    });
}

/**
 * Get the next queued task (FIFO).
 * @deprecated Use claimNextTask() for multi-worker support.
 */
export async function getNextQueuedTask(): Promise<GptTask | null> {
    const task = await db.query.gptTasks.findFirst({
        where: eq(gptTasks.status, "queued"),
        orderBy: [gptTasks.createdAt], // ASC for FIFO
    });
    return task ? mapToGptTask(task) : null;
}

/**
 * Get all tasks in running state (for recovery).
 */
export async function getRunningTasks(): Promise<GptTask[]> {
    const tasks = await db.query.gptTasks.findMany({
        where: eq(gptTasks.status, "running"),
    });
    return tasks.map(mapToGptTask);
}

// Helper to map DB row to GptTask type
function mapToGptTask(row: typeof gptTasks.$inferSelect): GptTask {
    return {
        ...row,
        status: row.status as TaskStatus,
        progress: row.progress as TaskProgress | null,
        metadata: row.metadata as Record<string, unknown> | null,
    };
}
