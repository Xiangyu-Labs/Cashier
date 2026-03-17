"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, taskRuns } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getLocalStorage } from "@/lib/storage/local";
import { isLocalUploadUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaModule from "@/lib/db/schema";

type DbSchema = typeof schemaModule;

/**
 * Delete images from local storage
 * @returns Results of delete operations (success and failures)
 */
async function deleteLocalImages(imageUrls: string[]): Promise<{
  success: string[];
  failed: { url: string; key: string; error: Error }[];
}> {
  const storage = getLocalStorage();
  const success: string[] = [];
  const failed: { url: string; key: string; error: Error }[] = [];

  for (const url of imageUrls) {
    // Only delete local upload URLs
    if (!isLocalUploadUrl(url)) {
      continue;
    }

    const key = storage.extractKeyFromUrl(url);
    if (key == null || key === "") {
      logger.warn({ url }, "Could not extract key from URL during deletion");
      continue;
    }

    const deleteResult = await storage.delete(key);
    if (deleteResult.success) {
      success.push(url);
    } else {
      failed.push({ url, key, error: deleteResult.error! });
    }
  }

  return { success, failed };
}

/**
 * Cancel running/pending tasks
 */
async function cancelRunningTasks(taskIds: string[]): Promise<void> {
  const tasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.id, taskIds),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  for (const task of tasks) {
    await flowEngine.cancel(task.id);
  }
}

/**
 * Get task runs related to source documents
 */
async function getRelatedTaskRuns(
  ledgerId: string,
  sourceDocumentIds: string[]
): Promise<Array<{ id: string; status: string; input: unknown }>> {
  return db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.scopeId, ledgerId),
      eq(taskRuns.entityType, "source_document"),
      inArray(taskRuns.entityId, sourceDocumentIds)
    ),
  }) as Promise<Array<{ id: string; status: string; input: unknown }>>;
}

/**
 * Soft delete ledger entries (cascade)
 */
function softDeleteLedgerEntries(
  tx: BetterSQLite3Database<DbSchema>,
  ledgerId: string,
  sourceDocumentIds: string[]
): void {
  const qEntries = forLedger(ledgerEntries, ledgerId);

  tx.update(ledgerEntries)
    .set(qEntries.softDelete)
    .where(and(qEntries.whereActive, inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)))
    .run();
}

/**
 * Soft delete task runs
 */
function softDeleteTaskRuns(tx: BetterSQLite3Database<DbSchema>, taskIds: string[]): void {
  if (taskIds.length === 0) return;

  tx.update(taskRuns).set({ deletedAt: new Date() }).where(inArray(taskRuns.id, taskIds)).run();
}

/**
 * Soft delete source documents
 */
function softDeleteSourceDocuments(
  tx: BetterSQLite3Database<DbSchema>,
  ledgerId: string,
  sourceDocumentIds: string[]
): void {
  const q = forLedger(sourceDocuments, ledgerId);

  tx.update(sourceDocuments)
    .set(q.softDelete)
    .where(and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)))
    .run();
}

/**
 * Delete a single source document (soft delete with cascade)
 */
export const deleteSourceDocumentAction = withLedgerAccess(
  async (ledgerId: string, sourceId: string): Promise<void> => {
    const q = forLedger(sourceDocuments, ledgerId);

    // Get source document to retrieve image URLs before deletion
    // Note: query includes soft-deleted records using eq() instead of whereActive
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.ledgerId, ledgerId), q.whereId(sourceId)),
    });

    // If record doesn't exist (including already soft-deleted), silently succeed (idempotent)
    if (!sourceDoc) {
      return;
    }

    // If record is already soft-deleted, also silently succeed
    if (sourceDoc.deletedAt != null) {
      return;
    }

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, [sourceId]);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteLedgerEntries(tx, ledgerId, [sourceId]);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, [sourceId]);
    });

    // Delete images from local storage after successful soft delete
    if (sourceDoc.imageUrls != null && sourceDoc.imageUrls.length > 0) {
      await deleteLocalImages(sourceDoc.imageUrls);
    }
  }
);

/**
 * Batch delete multiple source documents (soft delete with cascade)
 */
export const batchDeleteSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentIds: string[]): Promise<void> => {
    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);

    // Get source documents to retrieve image URLs before deletion
    const sourceDocs = await db.query.sourceDocuments.findMany({
      where: and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)),
    });

    const allImageUrls = sourceDocs.flatMap((doc) => doc.imageUrls || []);

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, sourceDocumentIds);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteLedgerEntries(tx, ledgerId, sourceDocumentIds);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, sourceDocumentIds);
    });

    // Delete images from local storage after successful soft delete
    if (allImageUrls.length > 0 && ledgerId !== "") {
      await deleteLocalImages(allImageUrls);
    }
  }
);
