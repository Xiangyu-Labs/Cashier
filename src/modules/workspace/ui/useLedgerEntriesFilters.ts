import { useMemo } from "react";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { type PeriodParams } from "@/lib/period-utils";
import { buildLedgerEntryFilters } from "../ledger-filter-state";

export function useLedgerEntriesFilters(periodParams: PeriodParams) {
  const filters = useMemo(() => buildLedgerEntryFilters(periodParams), [periodParams]);

  return {
    filters,
    startDateStr: formatDateTimeForApi(filters.startDate) ?? undefined,
    endDateStr: formatDateTimeForApi(filters.endDate) ?? undefined,
  };
}
