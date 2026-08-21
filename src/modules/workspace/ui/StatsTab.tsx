"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getEnhancedStats } from "@/modules/stats/actions";
import {
  addPeriod,
  formatCivilDate,
  formatDateTimeForApi,
  getDateInTimezone,
  parseDateString,
  type DateRangeType,
} from "@/lib/date-utils";
import { StatsContentView } from "@/modules/stats/ui";
import { useLocale } from "next-intl";
import type { Ledger } from "@/modules/ledger/contracts";
import { MAX_CHART_POINTS } from "@/modules/stats/lib/chart-points";
import { MAX_HEATMAP_DAYS } from "@/modules/stats/lib/heatmap-range";
import { QUERY } from "@/lib/constants";
import { DEFAULT_STATS_RANGE_TYPE } from "@/modules/workspace/initial-query-state";
import { buildStatsQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";
import type { TabQueryStateReport } from "@/components/tab-query-state";
import { usePathname } from "@/i18n/routing";
import {
  readStatsSearchParams,
  setStatsSearchParams,
  type StatsRange,
  type StatsView,
} from "@/modules/workspace/ledger-url-params";
import { pushLedgerUrl } from "@/modules/workspace/ledger-url-navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const STATS_QUERY_DEBOUNCE_MS = 250;

interface StatsTabProps {
  ledgerId?: string;
  ledger?: Ledger;
  onCategoryDrilldown?: (categoryId: string, startDate: string, endDate: string) => void;
  onDateDrilldown?: (date: string) => void;
  initialDate?: Date;
  timeZone?: string;
  onQueryStateChange?: (report: TabQueryStateReport) => void;
}

export function StatsTab({
  ledgerId,
  ledger,
  onCategoryDrilldown,
  onDateDrilldown,
  initialDate,
  timeZone,
  onQueryStateChange,
}: StatsTabProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statsUrlState = useMemo(() => readStatsSearchParams(searchParams), [searchParams]);
  const rangeType: DateRangeType = statsUrlState.range ?? DEFAULT_STATS_RANGE_TYPE;
  const periodOffset = statsUrlState.offset;
  const [todayKey, setTodayKey] = useState(
    () => getDateInTimezone(timeZone) ?? formatDateTimeForApi(initialDate ?? new Date())
  );
  useEffect(() => {
    const updateToday = () => {
      setTodayKey(getDateInTimezone(timeZone) ?? formatDateTimeForApi(new Date()));
    };
    updateToday();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") updateToday();
    };
    const interval = window.setInterval(updateToday, 60_000);
    window.addEventListener("focus", updateToday);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateToday);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [timeZone]);
  const today = useMemo(() => parseDateString(todayKey), [todayKey]);
  const currentDate = useMemo(
    () => addPeriod(today, rangeType, periodOffset),
    [periodOffset, rangeType, today]
  );
  const chartView = statsUrlState.view;
  const updateStatsUrl = useCallback(
    (update: Partial<{ range: StatsRange; offset: number; view: StatsView }>) => {
      const params = setStatsSearchParams(searchParams, {
        range: update.range ?? statsUrlState.range,
        offset: update.offset ?? statsUrlState.offset,
        view: update.view ?? statsUrlState.view,
      });
      pushLedgerUrl(pathname, params, "stats");
    },
    [pathname, searchParams, statsUrlState]
  );

  const statsDescriptor = useMemo(
    () =>
      buildStatsQueryDescriptor({
        ledgerId: ledgerId ?? "",
        currentDate,
        mainCurrency: ledger?.settings.mainCurrency ?? "CNY",
        rangeType,
        currentPeriod: periodOffset === 0,
      }),
    [currentDate, ledger?.settings.mainCurrency, ledgerId, periodOffset, rangeType]
  );
  const { startDate, endDate, startDateStr, endDateStr } = statsDescriptor.state;
  const queryDescriptor = useDebouncedValue(statsDescriptor, STATS_QUERY_DEBOUNCE_MS);

  const label = useMemo(() => {
    switch (rangeType) {
      case "week":
        return `${formatCivilDate(startDateStr, locale, { month: "numeric", day: "numeric" })} - ${formatCivilDate(endDateStr, locale, { month: "numeric", day: "numeric" })}`;
      case "month":
        return formatCivilDate(startDateStr, locale, { year: "numeric", month: "long" });
      case "year":
        return formatCivilDate(startDateStr, locale, { year: "numeric" });
      default:
        return "";
    }
  }, [endDateStr, locale, rangeType, startDateStr]);

  const statsQuery = useQuery({
    queryKey: queryDescriptor.queryKey,
    queryFn: () => getEnhancedStats(queryDescriptor.input),
    enabled: ledgerId !== undefined && ledgerId !== "",
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  const { data: stats, isError, refetch } = statsQuery;
  const hasOversizedResult =
    stats != null &&
    (stats.chart.length > MAX_CHART_POINTS || stats.heatmap.days.length > MAX_HEATMAP_DAYS);

  useEffect(() => {
    onQueryStateChange?.({
      ledgerId: ledgerId ?? "",
      tab: "stats",
      queryKey: queryDescriptor.queryKey,
      status: statsQuery.status,
      isFetching: statsQuery.isFetching,
      hasData: statsQuery.data !== undefined,
    });
  }, [
    ledgerId,
    onQueryStateChange,
    queryDescriptor.queryKey,
    statsQuery.isFetching,
    statsQuery.data,
    statsQuery.status,
  ]);

  return (
    <StatsContentView
      rangeType={rangeType}
      onRangeTypeChange={(type) => {
        updateStatsUrl({ range: type, offset: 0 });
      }}
      periodOffset={periodOffset}
      onPeriodOffsetChange={(offset) => updateStatsUrl({ offset })}
      label={label}
      startDate={startDate}
      endDate={endDate}
      startDateStr={startDateStr}
      endDateStr={endDateStr}
      stats={hasOversizedResult ? undefined : stats}
      isLoading={statsQuery.isFetching}
      isPlaceholderData={statsQuery.isPlaceholderData}
      isError={isError || hasOversizedResult}
      onRetry={() => void refetch()}
      chartView={chartView}
      onChartViewChange={(view) => updateStatsUrl({ view })}
      fallbackCurrency={ledger?.settings.mainCurrency ?? "CNY"}
      {...(onCategoryDrilldown !== undefined ? { onCategoryDrilldown } : {})}
      {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
    />
  );
}
