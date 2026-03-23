"use client";
import { useCallback, useMemo } from "react";
import { type PeriodParams } from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import {
  buildLedgerEntryFilters,
  buildLedgerFilterKey,
  splitLedgerFilterChange,
} from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";

export interface UseDetailsTabFiltersReturn {
  filters: EntryFilters;
  filterKey: string | null;
  handleFiltersChange: (
    onPeriodChange: (params: PeriodParams) => void,
    onAdvancedFiltersChange: (filters: LedgerAdvancedFilters) => void
  ) => (newFilters: EntryFilters) => void;
}

interface UseDetailsTabFiltersProps {
  periodParams: PeriodParams;
  advancedFilters: LedgerAdvancedFilters;
}

export function useDetailsTabFilters({
  periodParams,
  advancedFilters,
}: UseDetailsTabFiltersProps): UseDetailsTabFiltersReturn {
  const filters: EntryFilters = useMemo(
    () => buildLedgerEntryFilters(periodParams, advancedFilters),
    [advancedFilters, periodParams]
  );

  const filterKey = useMemo(() => buildLedgerFilterKey(filters), [filters]);

  const handleFiltersChange = useCallback(
    (
      onPeriodChange: (params: PeriodParams) => void,
      onAdvancedFiltersChange: (filters: LedgerAdvancedFilters) => void
    ) =>
      (newFilters: EntryFilters) => {
        const { periodUpdate, advancedFilterUpdate } = splitLedgerFilterChange({
          currentPeriod: periodParams,
          currentFilters: filters,
          nextFilters: newFilters,
        });

        if (periodUpdate != null) {
          onPeriodChange(periodUpdate);
        }
        onAdvancedFiltersChange(advancedFilterUpdate);
      },
    [filters, periodParams]
  );

  return {
    filters,
    filterKey,
    handleFiltersChange,
  };
}
