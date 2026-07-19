import { addPeriod, type DateRangeType, formatDateTimeForApi, getDateRange } from "@/lib/date-utils";
import { type PeriodParams, periodToDateRange } from "@/lib/period-utils";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";

export const DEFAULT_STATS_RANGE_TYPE: DateRangeType = "month";

export interface LedgerAdvancedFilters {
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  statuses?: SourceDocumentStatusType[];
}

export interface DetailsInitialQueryState {
  startDateStr: string | null;
  endDateStr: string | null;
  filterKey: string | null;
}

export interface StatsInitialQueryState {
  rangeType: DateRangeType;
  startDate: Date;
  endDate: Date;
  prevDateStart: Date;
  prevDateEnd: Date;
  startDateStr: string;
  endDateStr: string;
  prevDateStartStr: string;
  prevDateEndStr: string;
}

export function buildDetailsFilterKey(filters: LedgerAdvancedFilters): string | null {
  const parts: string[] = [];

  if (filters.categoryId != null && filters.categoryId !== "")
    parts.push(`cat:${filters.categoryId}`);
  if (filters.currency != null && filters.currency !== "") parts.push(`cur:${filters.currency}`);
  if (filters.minAmount !== undefined && filters.minAmount !== null) {
    parts.push(`min:${filters.minAmount}`);
  }
  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    parts.push(`max:${filters.maxAmount}`);
  }

  return parts.length > 0 ? parts.join("|") : null;
}

export function getDetailsInitialQueryState(
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters = {}
): DetailsInitialQueryState {
  const dateRange = periodToDateRange(periodParams);

  return {
    startDateStr: dateRange.startDate ?? null,
    endDateStr: dateRange.endDate ?? null,
    filterKey: buildDetailsFilterKey(advancedFilters),
  };
}

export function getStatsInitialQueryState(
  currentDate: Date,
  rangeType: DateRangeType = DEFAULT_STATS_RANGE_TYPE
): StatsInitialQueryState {
  const { startDate, endDate } = getDateRange(currentDate, rangeType);
  const prevAnchor = addPeriod(currentDate, rangeType, -1);

  const { startDate: prevDateStart, endDate: prevDateEnd } = getDateRange(prevAnchor, rangeType);

  return {
    rangeType,
    startDate,
    endDate,
    prevDateStart,
    prevDateEnd,
    startDateStr: formatDateTimeForApi(startDate)!,
    endDateStr: formatDateTimeForApi(endDate)!,
    prevDateStartStr: formatDateTimeForApi(prevDateStart)!,
    prevDateEndStr: formatDateTimeForApi(prevDateEnd)!,
  };
}
