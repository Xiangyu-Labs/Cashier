"use server";
import { withLedgerAccess } from "../access";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { serverComposition } from "@/application/server-composition-root";

export const getLedgerStatsAction = withLedgerAccess(
  async (
    ledgerId: string,
    startDate?: string,
    endDate?: string,
    mainCurrency?: string,
    filters?: Parameters<typeof calculateLedgerStats>[4]
  ) =>
    calculateLedgerStats(
      ledgerId,
      startDate,
      endDate,
      mainCurrency,
      filters,
      serverComposition.ledgerReads
    )
);
