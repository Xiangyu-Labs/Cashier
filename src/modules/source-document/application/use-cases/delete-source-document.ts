import { db } from "@/lib/db";
import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  whereSourceDocumentNotDeleted,
  whereSourceDocumentNotDeletedId,
} from "@/modules/source-document/application/source-document-state";
import { sourceDocuments } from "@/persistence";
import { and, inArray } from "drizzle-orm";
import {
  cancelActiveSourceDocumentTaskRuns,
  listRelatedSourceDocumentTaskRuns,
  softDeleteSourceDocumentsAndTaskRuns,
} from "../services/source-document-lifecycle";

interface DeleteSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
}

interface BatchDeleteSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
}

export async function deleteSourceDocument({
  ledgerId,
  sourceDocumentId,
}: DeleteSourceDocumentInput): Promise<DeleteSourceDocumentResultDto> {
  const sourceDoc = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });

  if (sourceDoc == null) {
    return {
      sourceDocumentId,
      deleted: false,
    };
  }

  const relatedTaskRuns = await listRelatedSourceDocumentTaskRuns(ledgerId, [sourceDocumentId]);
  await cancelActiveSourceDocumentTaskRuns(relatedTaskRuns.map((task) => task.id));

  db.transaction((tx) => {
    softDeleteSourceDocumentsAndTaskRuns(
      tx,
      ledgerId,
      [sourceDocumentId],
      relatedTaskRuns.map((task) => task.id)
    );
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
    where: and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)),
    columns: { id: true },
  });
  const activeDocumentIds = documents.map((document) => document.id);

  if (activeDocumentIds.length === 0) {
    return {
      sourceDocumentIds,
      deletedCount: 0,
    };
  }

  const relatedTaskRuns = await listRelatedSourceDocumentTaskRuns(ledgerId, activeDocumentIds);
  await cancelActiveSourceDocumentTaskRuns(relatedTaskRuns.map((task) => task.id));

  db.transaction((tx) => {
    softDeleteSourceDocumentsAndTaskRuns(
      tx,
      ledgerId,
      activeDocumentIds,
      relatedTaskRuns.map((task) => task.id)
    );
  });

  return {
    sourceDocumentIds,
    deletedCount: activeDocumentIds.length,
  };
}
