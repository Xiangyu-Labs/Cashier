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
  const payload: Parameters<typeof calculateLedgerEntryStats>[0] = {
    ledgerId,
    filters: {},
  };
  if (mainCurrency !== undefined) payload.mainCurrency = mainCurrency;
  if (startDate !== undefined) payload.filters.startDate = startDate;
  if (endDate !== undefined) payload.filters.endDate = endDate;
  if (filters?.categoryId !== undefined) payload.filters.categoryId = filters.categoryId;
  if (filters?.currency !== undefined) payload.filters.currency = filters.currency;
  if (filters?.minAmount !== undefined) payload.filters.minAmount = filters.minAmount;
  if (filters?.maxAmount !== undefined) payload.filters.maxAmount = filters.maxAmount;
  return calculateLedgerEntryStats(payload);
}
