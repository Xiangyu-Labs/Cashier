import { useMemo } from "react";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { type PeriodParams } from "@/lib/period-utils";
import { buildLedgerEntryFilters } from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";

export function useLedgerEntriesFilters(
  periodParams: PeriodParams,
  advancedFilters?: LedgerAdvancedFilters
) {
  const filters = useMemo(
    () => buildLedgerEntryFilters(periodParams, advancedFilters),
    [periodParams, advancedFilters]
  );

  return {
    filters,
    startDateStr: formatDateTimeForApi(filters.startDate) ?? undefined,
    endDateStr: formatDateTimeForApi(filters.endDate) ?? undefined,
  };
}
