"use server";

import { db } from "@/lib/db";
import { taskRuns, sourceDocuments } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { eq, and, isNull, inArray } from "drizzle-orm";

/**
 * Cancel a single task.
 * Validates ledger access and task ownership before calling flowEngine.cancel().
 *
 * @param ledgerId - The ledger ID for access control
 * @param taskId - The task ID to cancel
 */
export async function cancelTaskAction(ledgerId: string, taskId: string): Promise<void> {
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

    // Verify ledgerId from scopeId matches
    if (task.scopeId !== ledgerId) {
        throw new Error("Task does not belong to this ledger");
    }

    // Only pending or running tasks can be cancelled
    if (task.status !== 'pending' && task.status !== 'running') {
        throw new Error(`Cannot cancel task with status '${task.status}'`);
    }

    // Call the flow engine to cancel the task
    await flowEngine.cancel(taskId);

    // For orphaned parse_source_document tasks, the onCancel handler won't fire.
    // Soft delete the source document if needed.
    if (task.entityType === 'source_document' && task.entityId) {
        const q = forLedger(sourceDocuments, ledgerId);
        const doc = await db.query.sourceDocuments.findFirst({
            where: q.whereId(task.entityId),
        });
        // Only soft delete if still in 'processing' or 'queued' state
        if (doc && (doc.status === 'processing' || doc.status === 'queued')) {
            await db.update(sourceDocuments)
                .set({ deletedAt: new Date() })
                .where(q.whereId(task.entityId));
        }
    }
}

/**
 * Batch cancel multiple tasks.
 * Validates ledger access and task ownership for each task.
 *
 * @param ledgerId - The ledger ID for access control
 * @param taskIds - The task IDs to cancel
 */
export async function batchCancelTasksAction(ledgerId: string, taskIds: string[]): Promise<void> {
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

    // Filter to only tasks that belong to this ledger and are cancellable
    const validTasks = tasks.filter(task =>
        task.scopeId === ledgerId &&
        (task.status === 'pending' || task.status === 'running')
    );

    if (validTasks.length === 0) return;

    // Cancel each task
    await Promise.all(validTasks.map(task => flowEngine.cancel(task.id)));

    // For orphaned parse_source_document tasks, soft delete source documents
    const sourceDocTasks = validTasks.filter(
        task => task.entityType === 'source_document' && task.entityId
    );

    if (sourceDocTasks.length > 0) {
        const q = forLedger(sourceDocuments, ledgerId);
        const entityIds = sourceDocTasks.map(t => t.entityId!);

        // Fetch docs that need soft delete
        const docs = await db.query.sourceDocuments.findMany({
            where: and(
                inArray(sourceDocuments.id, entityIds),
                q.whereActive
            ),
        });

        // Soft delete docs still in processing/queued
        const docsToDelete = docs.filter(
            doc => doc.status === 'processing' || doc.status === 'queued'
        );

        if (docsToDelete.length > 0) {
            await db.update(sourceDocuments)
                .set({ deletedAt: new Date() })
                .where(and(
                    inArray(sourceDocuments.id, docsToDelete.map(d => d.id)),
                    q.whereActive
                ));
        }
    }
}
