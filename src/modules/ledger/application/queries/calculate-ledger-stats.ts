import { calculateLedgerEntryStats } from "@/modules/ledger/application/queries/calculate-ledger-entry-stats";
import { UNCATEGORIZED_SENTINEL } from "@/modules/ledger/application/queries/list-ledger-entries";
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
    search?: string | null;
  }
): Promise<LedgerSummaryDto> {
  const payload: Parameters<typeof calculateLedgerEntryStats>[0] = {
    ledgerId,
    filters: {},
  };
  if (mainCurrency !== undefined) payload.mainCurrency = mainCurrency;
  if (startDate !== undefined) payload.filters.startDate = startDate;
  if (endDate !== undefined) payload.filters.endDate = endDate;
  // "__uncategorized__" is only a UI/query sentinel; stats must translate it
  // to the same `categoryId = null` semantics used by entry listing.
  const categoryIdCandidate = filters?.categoryId;
  const isUncategorizedFilter = categoryIdCandidate === UNCATEGORIZED_SENTINEL;
  if (isUncategorizedFilter) {
    payload.filters.uncategorizedOnly = true;
  } else if (categoryIdCandidate !== undefined) {
    payload.filters.categoryId = categoryIdCandidate;
  }
  if (filters?.currency !== undefined) payload.filters.currency = filters.currency;
  if (filters?.minAmount !== undefined) payload.filters.minAmount = filters.minAmount;
  if (filters?.maxAmount !== undefined) payload.filters.maxAmount = filters.maxAmount;
  if (filters?.search !== undefined) payload.filters.search = filters.search;
  return calculateLedgerEntryStats(payload);
}
