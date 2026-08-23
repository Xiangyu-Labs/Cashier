import type { LedgerEntryFilterParams } from "./list-ledger-entry-page";
import type { LedgerReadPort } from "../ports";

export function calculateLedgerEntryStats(
  input: {
    ledgerId: string;
    filters: LedgerEntryFilterParams;
  },
  reads: Pick<LedgerReadPort, "calculateStats">
) {
  return reads.calculateStats(input);
}
