"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, taskRuns } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getR2Storage, isR2Enabled } from "@/lib/storage/r2";
import { isHttpUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Delete images from R2 storage
 */
async function deleteR2Images(imageUrls: string[]): Promise<void> {
    if (!isR2Enabled() || imageUrls.length === 0) {
        return;
    }

    const storage = getR2Storage();

    for (const url of imageUrls) {
        // Only delete HTTP URLs (R2 URLs)
        if (isHttpUrl(url)) {
            const key = storage.extractKeyFromUrl(url);
            if (key) {
                try {
                    await storage.delete(key);
                    logger.debug({ key }, "Deleted image from R2");
                } catch (error) {
                    // Log but don't fail - the database record is already soft deleted
                    logger.error({ error, key, url }, "Failed to delete image from R2");
                }
            }
        }
    }
}

/**
 * Delete a single source document (soft delete with cascade)
 */
export const deleteSourceDocumentAction = withLedgerAccess(async (
    ledgerId: string,
    sourceId: string
): Promise<void> => {

    const q = forLedger(sourceDocuments, ledgerId);
    const qEntries = forLedger(ledgerEntries, ledgerId);

    // Get source document to retrieve image URLs before deletion
    const sourceDoc = await db.query.sourceDocuments.findFirst({
        where: and(q.whereActive, q.whereId(sourceId)),
    });

    if (!sourceDoc) {
        throw new Error("Source document not found");
    }

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

    // Delete images from R2 after successful soft delete
    if (sourceDoc.imageUrls && sourceDoc.imageUrls.length > 0) {
        await deleteR2Images(sourceDoc.imageUrls);
    }
});

/**
 * Batch delete multiple source documents (soft delete with cascade)
 */
export const batchDeleteSourceDocumentsAction = withLedgerAccess(async (
    ledgerId: string,
    sourceDocumentIds: string[]
): Promise<void> => {
    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);
    const qEntries = forLedger(ledgerEntries, ledgerId);

    // Get source documents to retrieve image URLs before deletion
    const sourceDocs = await db.query.sourceDocuments.findMany({
        where: and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        ),
    });

    const allImageUrls = sourceDocs.flatMap(doc => doc.imageUrls || []);

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

    // Delete images from R2 after successful soft delete
    if (allImageUrls.length > 0) {
        await deleteR2Images(allImageUrls);
    }
});
