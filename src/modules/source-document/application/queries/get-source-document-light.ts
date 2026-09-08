import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import type { SourceDocumentReadPort } from "../ports";

export async function getSourceDocumentLightForLedger(
  ledgerId: string,
  sourceDocumentId: string,
  documents: Pick<SourceDocumentReadPort, "get">
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const document = await documents.get(ledgerId, sourceDocumentId);
  if (document == null) return null;

  // Keep the public detail payload while sharing the normal document read.
  const { metadata: _metadata, deletedAt: _deletedAt, updatedAt: _updatedAt, ...detail } = document;
  return {
    ...detail,
    hasImages: document.hasImages ?? false,
    ledgerEntries: document.ledgerEntries ?? [],
  };
}
