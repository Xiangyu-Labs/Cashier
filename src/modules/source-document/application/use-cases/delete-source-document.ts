import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
import type { SourceDocumentRevisionPort } from "../ports";

interface DeleteSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
}

export async function deleteSourceDocument(
  { ledgerId, sourceDocumentId }: DeleteSourceDocumentInput,
  revisions: SourceDocumentRevisionPort
): Promise<DeleteSourceDocumentResultDto> {
  const sourceDocument = await revisions.get(ledgerId, sourceDocumentId);
  if (sourceDocument == null || !sourceDocument.supportedActions.includes("delete")) {
    return {
      sourceDocumentId,
      deleted: false,
    };
  }

  const deleted = await revisions.softDelete(ledgerId, sourceDocumentId);

  return {
    sourceDocumentId,
    deleted,
  };
}
