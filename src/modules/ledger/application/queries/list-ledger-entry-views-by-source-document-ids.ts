import type { LedgerReadPort } from "../ports";

export function listLedgerEntryViewsBySourceDocumentIds(
  input: { ledgerId: string; sourceDocumentIds: string[]; includeDuplicatePending?: boolean },
  reads: Pick<LedgerReadPort, "listEntriesBySourceDocumentIds">
) {
  return reads.listEntriesBySourceDocumentIds(input);
}
