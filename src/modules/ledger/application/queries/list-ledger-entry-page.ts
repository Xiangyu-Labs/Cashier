import type { LedgerReadPort } from "../ports";
import type { LedgerEntryFilterParams } from "../../filters";

export type { LedgerEntryFilterParams } from "../../filters";

export function listLedgerEntryPage(
  input: {
    ledgerId: string;
    limit?: number;
    cursor?: string | null;
    filters: LedgerEntryFilterParams;
  },
  reads: Pick<LedgerReadPort, "listEntries">
) {
  return reads.listEntries(input);
}
