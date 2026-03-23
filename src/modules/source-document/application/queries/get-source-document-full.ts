import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { whereSourceDocumentNotDeletedId } from "@/modules/source-document/application/source-document-state";
import type { SourceDocumentFullDto } from "../../contracts";

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  const document = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });

  if (document == null) {
    throw new NotFoundError("Source document");
  }

  return {
    id: document.id,
    text: document.text,
    imageUrls: document.imageUrls ?? [],
    status: document.status,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function getSourceDocumentFull(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  return getSourceDocumentFullQuery(ledgerId, sourceDocumentId);
}
