import { currentApplication } from "@/application/current";
import { NotFoundError } from "@/lib/errors";
import type { SourceDocumentFullDto } from "../../contracts";

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  const document = await currentApplication.sourceDocumentReads.get(ledgerId, sourceDocumentId);

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
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  return getSourceDocumentFullQuery(ledgerId, sourceDocumentId);
}
