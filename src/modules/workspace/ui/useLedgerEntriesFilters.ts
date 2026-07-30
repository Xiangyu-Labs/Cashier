import { useMemo } from "react";
import { type PeriodParams } from "@/lib/period-utils";
import { buildLedgerEntryFilters } from "../ledger-filter-state";
import type { LedgerAdvancedFilters } from "../initial-query-state";
import { canonicalizeSourceDocumentStatuses } from "@/modules/source-document/types";

export function buildStreamTotalQuery(
  filters: ReturnType<typeof buildLedgerEntryFilters>,
  startDate: string | undefined,
  endDate: string | undefined
) {
  const statuses = canonicalizeSourceDocumentStatuses(filters.statuses);

  return {
    input: {
      ...(startDate != null && startDate !== "" ? { startDate } : {}),
      ...(endDate != null && endDate !== "" ? { endDate } : {}),
      ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
      ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
      ...(statuses != null ? { statuses } : {}),
      ...(filters.search != null && filters.search !== "" ? { search: filters.search } : {}),
    },
    statusesKey: statuses?.join(",") ?? null,
  };
}

export function useLedgerEntriesFilters(
  periodParams: PeriodParams,
  advancedFilters?: LedgerAdvancedFilters,
  timeZone?: string
) {
  const filters = useMemo(
    () => buildLedgerEntryFilters(periodParams, advancedFilters, timeZone),
    [periodParams, advancedFilters, timeZone]
  );

  return {
    filters,
    startDateStr: filters.startDate,
    endDateStr: filters.endDate,
  };
}
