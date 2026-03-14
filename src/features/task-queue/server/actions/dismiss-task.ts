"use server";

import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { eq, and, inArray, isNull } from "drizzle-orm";

/**
 * Helper to extract ledgerId from task scopeId
 */
function getLedgerIdFromTask(task: typeof taskRuns.$inferSelect): string | null {
    return task.scopeId ?? null;
}

/**
 * Dismiss (soft delete) a single task run.
 * Used for non-source-document tasks that don't have edit/retry functionality.
 */
export const dismissTaskAction = withLedgerAccess(async (ledgerId: string, taskId: string): Promise<void> => {
    // Verify the task belongs to this ledger
    const task = await db.query.taskRuns.findFirst({
        where: and(
            eq(taskRuns.id, taskId),
            isNull(taskRuns.deletedAt)
        ),
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Verify ledgerId from scopeId matches
    const taskLedgerId = getLedgerIdFromTask(task);
    if (taskLedgerId !== ledgerId) {
        throw new Error("Task does not belong to this ledger");
    }

    // Soft delete the task
    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(eq(taskRuns.id, taskId));
});

/**
 * Batch dismiss (soft delete) multiple task runs.
 * Used for non-source-document tasks that don't have edit/retry functionality.
 */
export const batchDismissTasksAction = withLedgerAccess(async (ledgerId: string, taskIds: string[]): Promise<void> => {
    if (taskIds.length === 0) return;

    // Fetch tasks to verify they belong to this ledger
    const tasks = await db.query.taskRuns.findMany({
        where: and(
            inArray(taskRuns.id, taskIds),
            isNull(taskRuns.deletedAt)
        ),
    });

    // Filter to only tasks that belong to this ledger
    const validTaskIds = tasks
        .filter(task => getLedgerIdFromTask(task) === ledgerId)
        .map(task => task.id);

    if (validTaskIds.length === 0) return;

    // Soft delete the tasks
    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(inArray(taskRuns.id, validTaskIds));
});
