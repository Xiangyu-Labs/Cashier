"use client";
import { useMemo } from "react";
import { type PeriodParams } from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import { buildLedgerEntryFilters, buildLedgerFilterKey } from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";

export interface UseDetailsTabFiltersReturn {
  filters: EntryFilters;
  filterKey: string | null;
}

interface UseDetailsTabFiltersProps {
  periodParams: PeriodParams;
  advancedFilters: LedgerAdvancedFilters;
  timeZone?: string;
}

export function useDetailsTabFilters({
  periodParams,
  advancedFilters,
  timeZone,
}: UseDetailsTabFiltersProps): UseDetailsTabFiltersReturn {
  const filters: EntryFilters = useMemo(
    () => buildLedgerEntryFilters(periodParams, advancedFilters, timeZone),
    [advancedFilters, periodParams, timeZone]
  );

  const filterKey = useMemo(() => buildLedgerFilterKey(filters), [filters]);

  return {
    filters,
    filterKey,
  };
}
