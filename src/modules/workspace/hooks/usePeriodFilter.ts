"use client";
import { useCallback, useMemo } from "react";
import {
  type PeriodParams,
  periodToDateRange,
  parsePeriodFromSearchParams,
} from "@/lib/period-utils";
import { parseDateString } from "@/lib/date-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import {
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";

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
    () => {
      const nextFilters: EntryFilters = {
        categoryId: filterParams.categoryId ?? null,
        currency: filterParams.currency ?? null,
        minAmount: filterParams.minAmount,
        maxAmount: filterParams.maxAmount,
      };

      if (dateRange.startDate !== null) {
        nextFilters.startDate = parseDateString(dateRange.startDate);
      }
      if (dateRange.endDate !== null) {
        nextFilters.endDate = parseDateString(dateRange.endDate);
      }

      return nextFilters;
    },
    [dateRange, filterParams]
  );

  const handlePeriodChange = useCallback(
    (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
      if (options?.skipUrlUpdate) return;

      const periodUpdate: {
        period: PeriodParams["period"];
        startDate?: string | null;
        endDate?: string | null;
      } = {
        period: newPeriod.period,
      };
      if (newPeriod.period === "custom") {
        if ("startDate" in newPeriod) periodUpdate.startDate = newPeriod.startDate ?? null;
        if ("endDate" in newPeriod) periodUpdate.endDate = newPeriod.endDate ?? null;
      }

      const params = updateLedgerSearchParams(searchParams, periodUpdate);
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  const handleFiltersChange = useCallback(
    (newFilters: EntryFilters) => {
      const formatDate = (d?: Date): string | null => {
        if (!d) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const nextStartDate = formatDate(newFilters.startDate);
      const nextEndDate = formatDate(newFilters.endDate);
      const datesChanged = nextStartDate !== dateRange.startDate || nextEndDate !== dateRange.endDate;
      const nextPeriod: PeriodParams["period"] = datesChanged
        ? nextStartDate != null || nextEndDate != null
          ? "custom"
          : "thisMonth"
        : periodParams.period;

      const filterUpdate: {
        period: PeriodParams["period"];
        startDate?: string | null;
        endDate?: string | null;
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
      } = {
        period: nextPeriod,
        categoryId: newFilters.categoryId ?? null,
        currency: newFilters.currency ?? null,
        minAmount: newFilters.minAmount ?? null,
        maxAmount: newFilters.maxAmount ?? null,
      };
      if (nextPeriod === "custom" && datesChanged) {
        filterUpdate.startDate = nextStartDate;
        filterUpdate.endDate = nextEndDate;
      }

      const params = updateLedgerSearchParams(searchParams, filterUpdate);

      replaceLedgerUrl(pathname, params);
    },
    [dateRange.endDate, dateRange.startDate, pathname, periodParams.period, searchParams]
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
