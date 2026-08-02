import type { LedgerReadPort } from "../ports";

export function listLedgerEntryViewsBySourceDocumentIds(
  input: { ledgerId: string; sourceDocumentIds: string[] },
  reads: LedgerReadPort
) {
  return reads.listEntriesBySourceDocumentIds(input);
}
