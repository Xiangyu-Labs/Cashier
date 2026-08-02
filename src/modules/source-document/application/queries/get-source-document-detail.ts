import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";
import type { SourceDocumentQueryPorts } from "../ports";

export async function getSourceDocumentDetail(
  sourceDocumentId: string,
  ports: SourceDocumentQueryPorts,
  authorizeLedger: (ledgerId: string) => Promise<unknown>
): Promise<SourceDocumentDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(
    sourceDocumentId,
    ports.documents,
    authorizeLedger
  );

  if (accessContext == null) {
    return null;
  }

  const [document, entriesByDocId] = await Promise.all([
    ports.documents.get(accessContext.ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds(
      { ledgerId: accessContext.ledgerId, sourceDocumentIds: [sourceDocumentId] },
      ports.ledgerReads
    ),
  ]);

  if (document == null) {
    return null;
  }

  return { ...document, ledgerEntries: entriesByDocId.get(document.id) ?? [] };
}
