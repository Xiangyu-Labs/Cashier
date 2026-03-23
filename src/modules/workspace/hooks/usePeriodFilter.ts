"use client";
import { useCallback, useMemo } from "react";
import {
  type PeriodParams,
  periodToDateRange,
  parsePeriodFromSearchParams,
} from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import {
  type LedgerUrlUpdate,
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";
import { buildLedgerEntryFilters, splitLedgerFilterChange } from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";

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
  handleAdvancedFiltersChange: (newFilters: LedgerAdvancedFilters) => void;
  handleFiltersChange: (newFilters: EntryFilters) => void;
}

function buildPeriodUrlUpdate(
  newPeriod: PeriodParams
): Pick<LedgerUrlUpdate, "period" | "startDate" | "endDate"> {
  const periodUpdate: Pick<LedgerUrlUpdate, "period" | "startDate" | "endDate"> = {
    period: newPeriod.period,
  };

  if (newPeriod.period === "custom") {
    if ("startDate" in newPeriod) {
      periodUpdate.startDate = newPeriod.startDate ?? null;
    }
    if ("endDate" in newPeriod) {
      periodUpdate.endDate = newPeriod.endDate ?? null;
    }
  }

  return periodUpdate;
}

export function usePeriodFilter({
  pathname,
  searchParams,
  initialPeriod: _initialPeriod,
}: UsePeriodFilterParams): UsePeriodFilterReturn {
  const periodParams = useMemo<PeriodParams>(() => {
    const parsed = parsePeriodFromSearchParams(searchParams);
    return parsed;
  }, [searchParams]);

  const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

  const filterParams = useMemo<FilterParams>(
    () => readLedgerFilterParams(searchParams),
    [searchParams]
  );

  const filters: EntryFilters = useMemo(
    () => buildLedgerEntryFilters(periodParams, filterParams),
    [filterParams, periodParams]
  );

  const handlePeriodChange = useCallback(
    (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
      if (options?.skipUrlUpdate) return;

      const params = updateLedgerSearchParams(searchParams, buildPeriodUrlUpdate(newPeriod));
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  const handleAdvancedFiltersChange = useCallback(
    (newFilters: LedgerAdvancedFilters) => {
      const params = updateLedgerSearchParams(searchParams, newFilters);
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  const handleFiltersChange = useCallback(
    (newFilters: EntryFilters) => {
      const { periodUpdate, advancedFilterUpdate } = splitLedgerFilterChange({
        currentPeriod: periodParams,
        currentFilters: filters,
        nextFilters: newFilters,
      });
      const params = updateLedgerSearchParams(searchParams, {
        ...(periodUpdate != null ? buildPeriodUrlUpdate(periodUpdate) : {}),
        ...advancedFilterUpdate,
      });

      replaceLedgerUrl(pathname, params);
    },
    [filters, pathname, periodParams, searchParams]
  );

  return {
    periodParams,
    dateRange,
    filters,
    filterParams,
    handlePeriodChange,
    handleAdvancedFiltersChange,
    handleFiltersChange,
  };
}
