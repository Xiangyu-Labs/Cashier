import type { LedgerEntry } from "@/modules/ledger/contracts";

export type BatchEntryUpdateData = Partial<Omit<LedgerEntry, "amount">> & {
  amount?: number;
};
