import { currentApplication } from "@/application/current";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";

interface DeleteSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
}

export async function deleteSourceDocument({
  ledgerId,
  sourceDocumentId,
}: DeleteSourceDocumentInput): Promise<DeleteSourceDocumentResultDto> {
  const sourceDocument = await currentApplication.sourceDocumentRevisions.get(ledgerId, sourceDocumentId);
  if (sourceDocument == null || !sourceDocument.supportedActions.includes("delete")) {
    return {
      sourceDocumentId,
      deleted: false,
    };
  }

  const deleted = await currentApplication.sourceDocumentRevisions.softDelete(ledgerId, sourceDocumentId);

  return {
    sourceDocumentId,
    deleted,
  };
}
