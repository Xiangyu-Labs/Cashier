import {
  addPeriod,
  type DateRangeType,
  formatDateTimeForApi,
  getDateRange,
} from "@/lib/date-utils";
export {
  buildDetailsFilterKey,
  getDetailsInitialQueryState,
  type DetailsInitialQueryState,
  type LedgerAdvancedFilters,
} from "@/modules/ledger/ledger-query";

export const DEFAULT_STATS_RANGE_TYPE: DateRangeType = "month";

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
