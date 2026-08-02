import type { LedgerReadPort } from "../ports";

export function getLedgerEntryDetail(id: string, ledgerId: string, reads: LedgerReadPort) {
  return reads.getEntry(id, ledgerId);
}
