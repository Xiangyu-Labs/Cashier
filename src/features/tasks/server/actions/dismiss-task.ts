"use server";

import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { eq, and, inArray, isNull } from "drizzle-orm";

/**
 * Helper to extract ledgerId from task input
 */
function getLedgerIdFromInput(input: unknown): string | null {
    if (typeof input === 'object' && input !== null && 'ledgerId' in input) {
        return (input as { ledgerId?: string }).ledgerId ?? null;
    }
    return null;
}

/**
 * Dismiss (soft delete) a single task run.
 * Used for non-source-document tasks that don't have edit/retry functionality.
 */
export async function dismissTaskAction(ledgerId: string, taskId: string): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

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

    // Verify ledgerId from input matches
    const taskLedgerId = getLedgerIdFromInput(task.input);
    if (taskLedgerId !== ledgerId) {
        throw new Error("Task does not belong to this ledger");
    }

    // Soft delete the task
    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(eq(taskRuns.id, taskId));
}

/**
 * Batch dismiss (soft delete) multiple task runs.
 * Used for non-source-document tasks that don't have edit/retry functionality.
 */
export async function batchDismissTasksAction(ledgerId: string, taskIds: string[]): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

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
        .filter(task => getLedgerIdFromInput(task.input) === ledgerId)
        .map(task => task.id);

    if (validTaskIds.length === 0) return;

    // Soft delete the tasks
    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(inArray(taskRuns.id, validTaskIds));
}
