"use server";
import { withLedgerAccess } from "../access";
import { getLedgerEntryDetail } from "@/modules/ledger/application/queries/get-ledger-entry-detail";
import { serverComposition } from "@/application/server-composition-root";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

export const getLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, id: string): Promise<LedgerEntryDto | null> => {
    return getLedgerEntryDetail(id, ledgerId, serverComposition.ledgerReads);
  }
);
