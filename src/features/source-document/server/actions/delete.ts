"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Delete a single source document (soft delete with cascade)
 */
export async function deleteSourceDocumentAction(
    ledgerId: string,
    sourceId: string
): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(sourceDocuments, ledgerId);
    const qEntries = forLedger(ledgerEntries, ledgerId);

    // Find task_runs that reference this source document before transaction
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.entityType, 'source_document'),
            eq(taskRuns.entityId, sourceId),
            eq(taskRuns.scopeId, ledgerId)
        ),
    });

    // Cancel any running/pending tasks before deleting
    const runningTasks = relatedTaskRuns.filter(
        task => task.status === 'pending' || task.status === 'running'
    );
    for (const task of runningTasks) {
        await flowEngine.cancel(task.id);
    }

    const taskIdsToDelete = relatedTaskRuns.map(task => task.id);

    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
        // 1. Cascade soft delete to ledger entries
        tx.update(ledgerEntries)
            .set(qEntries.softDelete)
            .where(and(
                qEntries.whereActive,
                eq(ledgerEntries.sourceDocumentId, sourceId)
            ))
            .run();

        // 2. Cascade soft delete to task_runs
        if (taskIdsToDelete.length > 0) {
            tx.update(taskRuns)
                .set({ deletedAt: new Date() })
                .where(inArray(taskRuns.id, taskIdsToDelete))
                .run();
        }

        // 3. Soft delete the source document
        tx.update(sourceDocuments)
            .set(q.softDelete)
            .where(q.whereId(sourceId))
            .run();
    });
}

/**
 * Batch delete multiple source documents (soft delete with cascade)
 */
export async function batchDeleteSourceDocumentsAction(
    ledgerId: string,
    sourceDocumentIds: string[]
): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);
    const qEntries = forLedger(ledgerEntries, ledgerId);

    // Find task_runs that reference these source documents before transaction
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.scopeId, ledgerId),
            eq(taskRuns.entityType, 'source_document'),
            inArray(taskRuns.entityId, sourceDocumentIds)
        ),
    });

    // Cancel any running/pending tasks before deleting
    const runningTasks = relatedTaskRuns.filter(
        task => task.status === 'pending' || task.status === 'running'
    );
    for (const task of runningTasks) {
        await flowEngine.cancel(task.id);
    }

    const taskIdsToDelete = relatedTaskRuns.map(task => task.id);

    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
        // 1. Cascade soft delete to associated ledger entries
        tx.update(ledgerEntries)
            .set(qEntries.softDelete)
            .where(and(
                qEntries.whereActive,
                inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)
            ))
            .run();

        // 2. Cascade soft delete to task_runs
        if (taskIdsToDelete.length > 0) {
            tx.update(taskRuns)
                .set({ deletedAt: new Date() })
                .where(inArray(taskRuns.id, taskIdsToDelete))
                .run();
        }

        // 3. Soft delete the source documents
        tx.update(sourceDocuments)
            .set(q.softDelete)
            .where(and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            ))
            .run();
    });
}
