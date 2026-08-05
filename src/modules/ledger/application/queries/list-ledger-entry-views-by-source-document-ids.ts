import type { LedgerReadPort } from "../ports";

export function listLedgerEntryViewsBySourceDocumentIds(
  input: { ledgerId: string; sourceDocumentIds: string[]; includeDuplicatePending?: boolean },
  reads: LedgerReadPort
) {
  return reads.listEntriesBySourceDocumentIds(input);
}
