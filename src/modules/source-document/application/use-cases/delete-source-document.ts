import { db } from "@/lib/db";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
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
