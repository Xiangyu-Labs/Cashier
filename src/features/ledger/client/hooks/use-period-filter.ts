"use client";

import { useCallback, useMemo } from "react";
import {
  type PeriodParams,
  periodToDateRange,
  parsePeriodFromSearchParams,
} from "@/lib/period-utils";
import { parseDateString } from "@/lib/date-utils";
import type { EntryFilters } from "@/features/ledger/components/EntryFilterPanel";
import {
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "@/features/ledger/client/ledger-url-params";
import { replaceLedgerUrl } from "@/features/ledger/client/ledger-url-navigation";

export interface FilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
}

interface UsePeriodFilterParams {
  pathname: string;
  searchParams: URLSearchParams;
  initialPeriod: PeriodParams;
}

interface UsePeriodFilterReturn {
  periodParams: PeriodParams;
  dateRange: { startDate: string | null; endDate: string | null };
  filters: EntryFilters;
  filterParams: FilterParams;
  handlePeriodChange: (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => void;
  handleFiltersChange: (newFilters: EntryFilters) => void;
}

export function usePeriodFilter({
  pathname,
  searchParams,
  initialPeriod: _initialPeriod,
}: UsePeriodFilterParams): UsePeriodFilterReturn {
  // 从 URL 实时派生 periodParams，确保 URL 变化时自动同步
  const periodParams = useMemo<PeriodParams>(() => {
    const parsed = parsePeriodFromSearchParams(searchParams);
    return parsed;
  }, [searchParams]);

  // Compute date range from period (memoized)
  const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

  // Read filter params from URL (single source of truth)
  const filterParams = useMemo<FilterParams>(
    () => readLedgerFilterParams(searchParams),
    [searchParams]
  );

  // Convert to EntryFilters format for compatibility
  const filters: EntryFilters = useMemo(
    () => ({
      startDate: dateRange.startDate !== null ? parseDateString(dateRange.startDate) : undefined,
      endDate: dateRange.endDate !== null ? parseDateString(dateRange.endDate) : undefined,
      categoryId: filterParams.categoryId ?? null,
      currency: filterParams.currency ?? null,
      minAmount: filterParams.minAmount,
      maxAmount: filterParams.maxAmount,
    }),
    [dateRange, filterParams]
  );

  // Handle period change - only update URL, state is derived from URL
  const handlePeriodChange = useCallback(
    (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
      if (options?.skipUrlUpdate) return;

      const params = updateLedgerSearchParams(searchParams, {
        period: newPeriod.period,
        startDate: newPeriod.startDate ?? null,
        endDate: newPeriod.endDate ?? null,
      });
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  // Handle filter changes from EntryFilterPanel (for advanced filters like amount)
  const handleFiltersChange = useCallback(
    (newFilters: EntryFilters) => {
      // If date changed, update period to custom
      if (newFilters.startDate !== undefined || newFilters.endDate !== undefined) {
        const formatDate = (d?: Date): string | undefined => {
          if (!d) return undefined;
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        };
        handlePeriodChange({
          period: "custom",
          startDate: formatDate(newFilters.startDate),
          endDate: formatDate(newFilters.endDate),
        });
      } else {
        // No dates means "thisMonth"
        handlePeriodChange({ period: "thisMonth" });
      }
    },
    [handlePeriodChange]
  );

  return {
    periodParams,
    dateRange,
    filters,
    filterParams,
    handlePeriodChange,
    handleFiltersChange,
  };
}
