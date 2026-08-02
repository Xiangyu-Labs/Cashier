import { NotFoundError } from "@/lib/errors";
import type { SourceDocumentFullDto } from "../../contracts";
import type { SourceDocumentReadPort } from "../ports";

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string,
  documents: SourceDocumentReadPort
): Promise<SourceDocumentFullDto> {
  const document = await documents.get(ledgerId, sourceDocumentId);

  if (document == null) {
    throw new NotFoundError("Source document");
  }

  return {
    id: document.id,
    text: document.text,
    files: document.files,
    status: document.status,
    createdAt: document.createdAt,
  };
}

export async function getSourceDocumentFull(
  ledgerId: string,
  sourceDocumentId: string,
  documents: SourceDocumentReadPort
): Promise<SourceDocumentFullDto> {
  return getSourceDocumentFullQuery(ledgerId, sourceDocumentId, documents);
}
