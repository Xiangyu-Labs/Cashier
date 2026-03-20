"use client";

import { type PeriodParams, periodToDateRange } from "@/lib/period-utils";

export interface LedgerAdvancedFilters {
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export interface DetailsInitialQueryState {
  startDateStr: string | null;
  endDateStr: string | null;
  filterKey: string | null;
}

export function buildDetailsFilterKey(filters: LedgerAdvancedFilters): string | null {
  const parts: string[] = [];

  if (filters.categoryId != null && filters.categoryId !== "") parts.push(`cat:${filters.categoryId}`);
  if (filters.currency != null && filters.currency !== "") parts.push(`cur:${filters.currency}`);
  if (filters.minAmount !== undefined && filters.minAmount !== null) {
    parts.push(`min:${filters.minAmount}`);
  }
  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    parts.push(`max:${filters.maxAmount}`);
  }

  return parts.length > 0 ? parts.join("|") : null;
}

export function getDetailsInitialQueryState(
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters = {}
): DetailsInitialQueryState {
  const dateRange = periodToDateRange(periodParams);

  return {
    startDateStr: dateRange.startDate ?? null,
    endDateStr: dateRange.endDate ?? null,
    filterKey: buildDetailsFilterKey(advancedFilters),
  };
}
