import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { type PeriodParams, periodToDateRange } from "@/lib/period-utils";
import type { EntryFilters } from "@/modules/ledger/ui";
import type { LedgerAdvancedFilters } from "./initial-query-state";

type LedgerFilterKeyInput = Pick<
  EntryFilters,
  "categoryId" | "currency" | "minAmount" | "maxAmount"
>;

export function buildLedgerEntryFilters(
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters = {}
): EntryFilters {
  const dateRange = periodToDateRange(periodParams);
  const nextFilters: EntryFilters = {};

  if (dateRange.startDate != null) {
    nextFilters.startDate = parseDateString(dateRange.startDate);
  }
  if (dateRange.endDate != null) {
    nextFilters.endDate = parseDateString(dateRange.endDate);
  }
  if (advancedFilters.categoryId !== undefined) {
    nextFilters.categoryId = advancedFilters.categoryId;
  }
  if (advancedFilters.currency !== undefined) {
    nextFilters.currency = advancedFilters.currency;
  }
  if (advancedFilters.minAmount !== undefined) {
    nextFilters.minAmount = advancedFilters.minAmount;
  }
  if (advancedFilters.maxAmount !== undefined) {
    nextFilters.maxAmount = advancedFilters.maxAmount;
  }

  return nextFilters;
}

export function buildLedgerFilterKey(filters: LedgerFilterKeyInput): string | null {
  const parts: string[] = [];

  if (filters.categoryId != null && filters.categoryId !== "") {
    parts.push(`cat:${filters.categoryId}`);
  }
  if (filters.currency != null && filters.currency !== "") {
    parts.push(`cur:${filters.currency}`);
  }
  if (filters.minAmount !== undefined && filters.minAmount !== null) {
    parts.push(`min:${filters.minAmount}`);
  }
  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    parts.push(`max:${filters.maxAmount}`);
  }

  return parts.length > 0 ? parts.join("|") : null;
}

export function splitLedgerFilterChange(args: {
  currentPeriod: PeriodParams;
  currentFilters: EntryFilters;
  nextFilters: EntryFilters;
}): {
  periodUpdate?: PeriodParams;
  advancedFilterUpdate: LedgerAdvancedFilters;
} {
  const currentStartDate = formatDateTimeForApi(args.currentFilters.startDate) ?? null;
  const currentEndDate = formatDateTimeForApi(args.currentFilters.endDate) ?? null;
  const nextStartDate = formatDateTimeForApi(args.nextFilters.startDate) ?? null;
  const nextEndDate = formatDateTimeForApi(args.nextFilters.endDate) ?? null;

  let periodUpdate: PeriodParams | undefined;
  if (nextStartDate !== currentStartDate || nextEndDate !== currentEndDate) {
    if (nextStartDate != null || nextEndDate != null) {
      periodUpdate = {
        period: "custom",
        ...(nextStartDate != null ? { startDate: nextStartDate } : {}),
        ...(nextEndDate != null ? { endDate: nextEndDate } : {}),
      };
    } else if (args.currentPeriod.period !== "thisMonth") {
      periodUpdate = { period: "thisMonth" };
    } else {
      periodUpdate = { period: "thisMonth" };
    }
  }

  const advancedFilterUpdate: LedgerAdvancedFilters = {};
  if ("categoryId" in args.nextFilters) {
    advancedFilterUpdate.categoryId = args.nextFilters.categoryId;
  }
  if ("currency" in args.nextFilters) {
    advancedFilterUpdate.currency = args.nextFilters.currency;
  }
  if ("minAmount" in args.nextFilters) {
    advancedFilterUpdate.minAmount = args.nextFilters.minAmount;
  }
  if ("maxAmount" in args.nextFilters) {
    advancedFilterUpdate.maxAmount = args.nextFilters.maxAmount;
  }

  return {
    ...(periodUpdate != null ? { periodUpdate } : {}),
    advancedFilterUpdate,
  };
}
