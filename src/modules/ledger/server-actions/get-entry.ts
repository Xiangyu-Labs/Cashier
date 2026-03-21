"use server";
import { withLedgerAccess } from "../access";
import { getLedgerEntryDetail } from "@/modules/ledger/queries";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

export const getLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, id: string): Promise<LedgerEntryDto | null> => {
    return getLedgerEntryDetail(id, ledgerId);
  }
);
