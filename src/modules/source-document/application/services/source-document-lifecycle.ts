import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cancelTask } from "@/lib/tasks";
import { sourceDocuments, taskRuns, type TaskRun } from "@/persistence";
import {
  deletedSourceDocumentPatch,
  whereSourceDocumentNotDeleted,
} from "../source-document-state";
import {
  softDeleteSourceDocumentLedgerEntries,
  type SourceDocumentTransaction,
} from "./source-document-ledger-entries";

export type RelatedSourceDocumentTaskRun = Pick<TaskRun, "id" | "status" | "input">;

export async function listRelatedSourceDocumentTaskRuns(
  ledgerId: string,
  sourceDocumentIds: string[]
): Promise<RelatedSourceDocumentTaskRun[]> {
  if (sourceDocumentIds.length === 0) {
    return [];
  }

  return db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.scopeId, ledgerId),
      eq(taskRuns.entityType, "source_document"),
      inArray(taskRuns.entityId, sourceDocumentIds)
    ),
  }) as Promise<RelatedSourceDocumentTaskRun[]>;
}

export async function cancelActiveSourceDocumentTaskRuns(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const activeTasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.id, taskIds),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  for (const task of activeTasks) {
    await cancelTask(task.id);
  }
}

export function softDeleteSourceDocumentsAndTaskRuns(
  tx: SourceDocumentTransaction,
  ledgerId: string,
  sourceDocumentIds: string[],
  taskIds: string[]
): void {
  if (sourceDocumentIds.length === 0) {
    return;
  }

  const now = new Date();

  softDeleteSourceDocumentLedgerEntries(tx, ledgerId, sourceDocumentIds);

  if (taskIds.length > 0) {
    tx.update(taskRuns).set({ deletedAt: now }).where(inArray(taskRuns.id, taskIds)).run();
  }

  tx.update(sourceDocuments)
    .set(deletedSourceDocumentPatch(now))
    .where(and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)))
    .run();
}
