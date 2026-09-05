import { NotFoundError } from "@/lib/errors";
import type { SourceDocumentFullDto } from "../../contracts";
import type { SourceDocumentReadPort } from "../ports";

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string,
  documents: Pick<SourceDocumentReadPort, "getEvidence">
): Promise<SourceDocumentFullDto> {
  const document = await documents.getEvidence(ledgerId, sourceDocumentId);

  if (document == null) {
    throw new NotFoundError("Source document");
  }

  return document;
}
