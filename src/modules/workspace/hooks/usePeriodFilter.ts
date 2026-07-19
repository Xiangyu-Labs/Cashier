"use client";
import { useCallback, useMemo } from "react";
import {
  type PeriodParams,
  periodToDateRange,
  parsePeriodFromSearchParams,
} from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import {
  type LedgerUrlUpdate,
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";
import {
  buildLedgerEntryFilters,
  splitLedgerFilterChange,
  type StreamStatusPreset,
  STREAM_STATUS_PRESET_VALUES,
} from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";

export interface FilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  statuses: SourceDocumentStatusType[];
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
  statuses: SourceDocumentStatusType[];
  handlePeriodChange: (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => void;
  handleAdvancedFiltersChange: (newFilters: LedgerAdvancedFilters) => void;
  handleFiltersChange: (newFilters: EntryFilters) => void;
  applyStreamStatusPreset: (preset: StreamStatusPreset) => void;
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

  const statuses: SourceDocumentStatusType[] = useMemo(
    () => filterParams.statuses ?? [],
    [filterParams.statuses]
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

  const applyStreamStatusPreset = useCallback(
    (preset: StreamStatusPreset) => {
      const presetStatuses = STREAM_STATUS_PRESET_VALUES[preset];
      const params = updateLedgerSearchParams(searchParams, {
        period: "all",
        minAmount: null,
        maxAmount: null,
        statuses: presetStatuses,
        tab: "stream",
      });
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  return {
    periodParams,
    dateRange,
    filters,
    filterParams,
    statuses,
    handlePeriodChange,
    handleAdvancedFiltersChange,
    handleFiltersChange,
    applyStreamStatusPreset,
  };
}
