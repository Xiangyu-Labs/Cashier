import { currentApplication } from "@/application/current";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";

export async function getSourceDocumentDetail(
  sourceDocumentId: string
): Promise<SourceDocumentDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(sourceDocumentId);

  if (accessContext == null) {
    return null;
  }

  const [document, entriesByDocId] = await Promise.all([
    currentApplication.sourceDocumentReads.get(accessContext.ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds({
      ledgerId: accessContext.ledgerId,
      sourceDocumentIds: [sourceDocumentId],
    }),
  ]);

  if (document == null) {
    return null;
  }

  return { ...document, ledgerEntries: entriesByDocId.get(document.id) ?? [] };
}
