"use client";
import { useCallback, useMemo } from "react";
import {
  type PeriodParams,
  type PeriodPreset,
  periodToDateRange,
  parsePeriodFromSearchParams,
} from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import {
  getScopedLedgerSearchParams,
  type LedgerFilterScope,
  type LedgerUrlUpdate,
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "../ledger-url-params";
import { pushLedgerUrl } from "../ledger-url-navigation";
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
  search: string | null;
}

interface UsePeriodFilterParams {
  pathname: string;
  searchParams: URLSearchParams;
  initialPeriod: PeriodParams;
  scope?: LedgerFilterScope;
  timeZone?: string;
}

interface UsePeriodFilterReturn {
  periodParams: PeriodParams;
  dateRange: { startDate: string | null; endDate: string | null };
  filters: EntryFilters;
  filterParams: FilterParams;
  statuses: SourceDocumentStatusType[];
  handlePeriodChange: (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => void;
  handleAdvancedFiltersChange: (newFilters: LedgerAdvancedFilters) => void;
  handleFiltersChange: (newFilters: EntryFilters, requestedPeriod?: PeriodPreset) => void;
  applyStreamStatusPreset: (preset: StreamStatusPreset) => void;
  resetFilters: () => void;
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
  scope = "stream",
  timeZone,
}: UsePeriodFilterParams): UsePeriodFilterReturn {
  const scopedSearchParams = useMemo(
    () => getScopedLedgerSearchParams(searchParams, scope),
    [scope, searchParams]
  );
  const periodParams = useMemo<PeriodParams>(() => {
    const parsed = parsePeriodFromSearchParams(scopedSearchParams);
    return parsed;
  }, [scopedSearchParams]);

  const dateRange = useMemo(
    () => periodToDateRange(periodParams, timeZone),
    [periodParams, timeZone]
  );

  const filterParams = useMemo<FilterParams>(
    () => readLedgerFilterParams(searchParams, scope),
    [scope, searchParams]
  );

  const filters: EntryFilters = useMemo(
    () => buildLedgerEntryFilters(periodParams, filterParams, timeZone),
    [filterParams, periodParams, timeZone]
  );

  const statuses: SourceDocumentStatusType[] = useMemo(
    () => filterParams.statuses ?? [],
    [filterParams.statuses]
  );

  const handlePeriodChange = useCallback(
    (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
      if (options?.skipUrlUpdate) return;

      const params = updateLedgerSearchParams(searchParams, buildPeriodUrlUpdate(newPeriod), scope);
      pushLedgerUrl(pathname, params, "filter");
    },
    [pathname, scope, searchParams]
  );

  const handleAdvancedFiltersChange = useCallback(
    (newFilters: LedgerAdvancedFilters) => {
      const params = updateLedgerSearchParams(searchParams, newFilters, scope);
      pushLedgerUrl(pathname, params, "filter");
    },
    [pathname, scope, searchParams]
  );

  const handleFiltersChange = useCallback(
    (newFilters: EntryFilters, requestedPeriod?: PeriodPreset) => {
      const { periodUpdate, advancedFilterUpdate } = splitLedgerFilterChange({
        currentPeriod: periodParams,
        currentFilters: filters,
        nextFilters: newFilters,
        ...(requestedPeriod !== undefined ? { requestedPeriod } : {}),
      });
      const params = updateLedgerSearchParams(
        searchParams,
        {
          ...(periodUpdate != null ? buildPeriodUrlUpdate(periodUpdate) : {}),
          ...advancedFilterUpdate,
        },
        scope
      );

      pushLedgerUrl(pathname, params, "filter");
    },
    [filters, pathname, periodParams, scope, searchParams]
  );

  const applyStreamStatusPreset = useCallback(
    (preset: StreamStatusPreset) => {
      const presetStatuses = STREAM_STATUS_PRESET_VALUES[preset];
      const params = updateLedgerSearchParams(
        searchParams,
        {
          period: "all",
          minAmount: null,
          maxAmount: null,
          statuses: presetStatuses,
          tab: "stream",
        },
        "stream"
      );
      pushLedgerUrl(pathname, params, "filter");
    },
    [pathname, searchParams]
  );

  const resetFilters = useCallback(() => {
    const params = updateLedgerSearchParams(
      searchParams,
      {
        period: "thisMonth",
        categoryId: null,
        currency: null,
        minAmount: null,
        maxAmount: null,
        statuses: null,
        search: null,
      },
      scope
    );
    pushLedgerUrl(pathname, params, "filter");
  }, [pathname, scope, searchParams]);

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
    resetFilters,
  };
}
