"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { cancelFlowTask } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  softDeleteSourceDocumentLedgerEntries,
  type SourceDocumentTransaction,
} from "@/modules/source-document/application/services/source-document-ledger-entries";
import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";

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
    await cancelFlowTask(task.id);
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
 * Soft delete task runs
 */
function softDeleteTaskRuns(tx: SourceDocumentTransaction, taskIds: string[]): void {
  if (taskIds.length === 0) return;

  tx.update(taskRuns).set({ deletedAt: new Date() }).where(inArray(taskRuns.id, taskIds)).run();
}

/**
 * Soft delete source documents
 */
function softDeleteSourceDocuments(
  tx: SourceDocumentTransaction,
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
  async (ledgerId: string, sourceId: string): Promise<DeleteSourceDocumentResultDto> => {
    const q = forLedger(sourceDocuments, ledgerId);

    // Get source document to retrieve image URLs before deletion
    // Note: query includes soft-deleted records using eq() instead of whereActive
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.ledgerId, ledgerId), q.whereId(sourceId)),
    });

    // If record doesn't exist (including already soft-deleted), silently succeed (idempotent)
    if (!sourceDoc) {
      return {
        sourceDocumentId: sourceId,
        deleted: false,
      };
    }

    // If record is already soft-deleted, also silently succeed
    if (sourceDoc.deletedAt != null) {
      return {
        sourceDocumentId: sourceId,
        deleted: false,
      };
    }

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, [sourceId]);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteSourceDocumentLedgerEntries(tx, ledgerId, [sourceId]);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, [sourceId]);
    });

    return {
      sourceDocumentId: sourceId,
      deleted: true,
    };
  }
);

/**
 * Batch delete multiple source documents (soft delete with cascade)
 */
export const batchDeleteSourceDocumentsAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceDocumentIds: string[]
  ): Promise<BatchDeleteSourceDocumentsResultDto> => {
    if (sourceDocumentIds.length === 0) {
      return {
        sourceDocumentIds,
        deletedCount: 0,
      };
    }

    const q = forLedger(sourceDocuments, ledgerId);
    const activeDocuments = await db.query.sourceDocuments.findMany({
      where: and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)),
      columns: { id: true },
    });
    const activeDocumentIds = activeDocuments.map((document) => document.id);

    if (activeDocumentIds.length === 0) {
      return {
        sourceDocumentIds,
        deletedCount: 0,
      };
    }

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, activeDocumentIds);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteSourceDocumentLedgerEntries(tx, ledgerId, activeDocumentIds);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, activeDocumentIds);
    });

    return {
      sourceDocumentIds,
      deletedCount: activeDocumentIds.length,
    };
  }
);
