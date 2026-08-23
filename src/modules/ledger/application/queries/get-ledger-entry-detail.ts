import type { LedgerReadPort } from "../ports";

export function getLedgerEntryDetail(
  id: string,
  ledgerId: string,
  reads: Pick<LedgerReadPort, "getEntry">
) {
  return reads.getEntry(id, ledgerId);
}
