import {
  addPeriod,
  type DateRangeType,
  formatDateTimeForApi,
  getDateRange,
} from "@/lib/date-utils";
export type { LedgerAdvancedFilters } from "@/modules/ledger/ledger-query";

export const DEFAULT_STATS_RANGE_TYPE: DateRangeType = "month";

export interface StatsInitialQueryState {
  rangeType: DateRangeType;
  /** "same_period" when the current period is truncated to today. */
  mode: "same_period" | "full_period";
  startDate: Date;
  endDate: Date;
  prevDateStart: Date;
  prevDateEnd: Date;
  startDateStr: string;
  endDateStr: string;
  prevDateStartStr: string;
  prevDateEndStr: string;
}

export function getStatsInitialQueryState(
  currentDate: Date,
  rangeType: DateRangeType = DEFAULT_STATS_RANGE_TYPE,
  options: { currentPeriod?: boolean } = {}
): StatsInitialQueryState {
  const currentPeriod = options.currentPeriod !== false;
  const { startDate, endDate } = getDateRange(currentDate, rangeType);
  const effectiveEnd = currentPeriod ? currentDate : endDate;
  const prevAnchor = addPeriod(currentDate, rangeType, -1);

  const { startDate: prevDateStart, endDate: prevDateEnd } = getDateRange(prevAnchor, rangeType);
  let effectivePrevEnd = prevDateEnd;
  if (currentPeriod) {
    const elapsedDays = civilDayNumber(effectiveEnd) - civilDayNumber(startDate);
    const candidate = addCivilDays(prevDateStart, elapsedDays);
    effectivePrevEnd = candidate < prevDateEnd ? candidate : prevDateEnd;
  }

  return {
    rangeType,
    mode: currentPeriod ? "same_period" : "full_period",
    startDate,
    endDate: effectiveEnd,
    prevDateStart,
    prevDateEnd: effectivePrevEnd,
    startDateStr: formatDateTimeForApi(startDate)!,
    endDateStr: formatDateTimeForApi(effectiveEnd)!,
    prevDateStartStr: formatDateTimeForApi(prevDateStart)!,
    prevDateEndStr: formatDateTimeForApi(effectivePrevEnd)!,
  };
}

/** Days since the Unix epoch for a local civil date (DST-safe). */
function civilDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Add whole civil days to a local date without timezone drift. */
function addCivilDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
