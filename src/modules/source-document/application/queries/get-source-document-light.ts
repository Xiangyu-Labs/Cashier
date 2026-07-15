import { getTargetSourceDocument } from "@/application/adapters/sqlite";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";

export async function getSourceDocumentLight(
  sourceDocumentId: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(sourceDocumentId);

  if (accessContext == null) {
    return null;
  }

  const document = await getTargetSourceDocument(accessContext.ledgerId, sourceDocumentId);

  if (document == null) {
    return null;
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId: accessContext.ledgerId,
    sourceDocumentIds: [document.id],
  });

  return {
    ...document,
    ledgerEntries: entriesByDocId.get(document.id) ?? [],
    hasImages: document.hasImages ?? accessContext.hasImages,
  };
}
