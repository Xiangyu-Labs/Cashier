import { db } from "@/lib/db";
import { cancelFlowTask } from "@/lib/flow";
import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  softDeleteSourceDocumentLedgerEntries,
  type SourceDocumentTransaction,
} from "@/modules/source-document/application/services/source-document-ledger-entries";
import {
  deletedSourceDocumentPatch,
  whereSourceDocumentNotDeleted,
} from "@/modules/source-document/application/source-document-state";
import { SourceDocumentStatus } from "@/modules/source-document/types";
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
  tx.update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)))
    .run();
}

export async function deleteSourceDocument({
  ledgerId,
  sourceDocumentId,
}: DeleteSourceDocumentInput): Promise<DeleteSourceDocumentResultDto> {
  const sourceDoc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.ledgerId, ledgerId), eq(sourceDocuments.id, sourceDocumentId)),
  });

  if (
    !sourceDoc ||
    sourceDoc.status === SourceDocumentStatus.Deleted ||
    sourceDoc.deletedAt != null
  ) {
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

  const documents = await db.query.sourceDocuments.findMany({
    where: and(eq(sourceDocuments.ledgerId, ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)),
    columns: { id: true, status: true, deletedAt: true },
  });
  const activeDocumentIds = documents
    .filter(
      (document) =>
        document.status !== SourceDocumentStatus.Deleted && document.deletedAt == null
    )
    .map((document) => document.id);

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
