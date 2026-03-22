import { useMemo } from "react";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { type PeriodParams, periodToDateRange } from "@/lib/period-utils";
import { type EntryFilters } from "@/modules/ledger/ui";

export function useLedgerEntriesFilters(periodParams: PeriodParams) {
  const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

  const filters: EntryFilters = useMemo(
    () => ({
      ...(dateRange.startDate != null && dateRange.startDate !== ""
        ? { startDate: parseDateString(dateRange.startDate) }
        : {}),
      ...(dateRange.endDate != null && dateRange.endDate !== ""
        ? { endDate: parseDateString(dateRange.endDate) }
        : {}),
    }),
    [dateRange]
  );

  return {
    filters,
    startDateStr: formatDateTimeForApi(filters.startDate) ?? undefined,
    endDateStr: formatDateTimeForApi(filters.endDate) ?? undefined,
  };
}
