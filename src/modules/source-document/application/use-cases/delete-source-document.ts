import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { cancelFlowTask } from "@/lib/flow";
import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  softDeleteSourceDocumentLedgerEntries,
  type SourceDocumentTransaction,
} from "@/modules/source-document/application/services/source-document-ledger-entries";
import { sourceDocuments, taskRuns } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";

interface DeleteSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
}

interface BatchDeleteSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
}

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

function softDeleteTaskRuns(tx: SourceDocumentTransaction, taskIds: string[]): void {
  if (taskIds.length === 0) return;

  tx.update(taskRuns).set({ deletedAt: new Date() }).where(inArray(taskRuns.id, taskIds)).run();
}

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

export async function deleteSourceDocument({
  ledgerId,
  sourceDocumentId,
}: DeleteSourceDocumentInput): Promise<DeleteSourceDocumentResultDto> {
  const q = forLedger(sourceDocuments, ledgerId);
  const sourceDoc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.ledgerId, ledgerId), q.whereId(sourceDocumentId)),
  });

  if (!sourceDoc || sourceDoc.deletedAt != null) {
    return {
      sourceDocumentId,
      deleted: false,
    };
  }

  const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, [sourceDocumentId]);
  await cancelRunningTasks(relatedTaskRuns.map((task) => task.id));
  const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

  db.transaction((tx) => {
    softDeleteSourceDocumentLedgerEntries(tx, ledgerId, [sourceDocumentId]);
    softDeleteTaskRuns(tx, taskIdsToDelete);
    softDeleteSourceDocuments(tx, ledgerId, [sourceDocumentId]);
  });

  return {
    sourceDocumentId,
    deleted: true,
  };
}

export async function batchDeleteSourceDocuments({
  ledgerId,
  sourceDocumentIds,
}: BatchDeleteSourceDocumentsInput): Promise<BatchDeleteSourceDocumentsResultDto> {
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

  const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, activeDocumentIds);
  await cancelRunningTasks(relatedTaskRuns.map((task) => task.id));
  const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

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
