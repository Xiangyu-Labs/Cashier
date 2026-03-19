"use server";

import { withLedgerAccess } from "@/lib/auth-actions";
import { calculateLedgerEntryStats } from "@/modules/ledger/application/queries/calculate-ledger-entry-stats";
import type { LedgerSummaryDto } from "@/modules/ledger/contracts";

export async function calculateLedgerStats(
  ledgerId: string,
  startDate?: string,
  endDate?: string,
  mainCurrency?: string,
  filters?: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  }
): Promise<LedgerSummaryDto> {
  return calculateLedgerEntryStats({
    ledgerId,
    mainCurrency,
    filters: {
      startDate,
      endDate,
      categoryId: filters?.categoryId,
      currency: filters?.currency,
      minAmount: filters?.minAmount,
      maxAmount: filters?.maxAmount,
    },
  });
}

export const getLedgerStatsAction = withLedgerAccess(calculateLedgerStats);
