"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnhancedStats } from "@/modules/stats/actions";
import { invalidateCalendar, invalidateLedgerStats } from "@/lib/query-keys";
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
import { QUERY } from "@/lib/constants";
import { DEFAULT_STATS_RANGE_TYPE } from "@/modules/workspace/initial-query-state";
import { buildStatsQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";
import { useRegisterPullToRefresh } from "@/modules/workspace/pull-to-refresh-context";
import type { TabQueryStateReport } from "./tab-query-state";

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
  const queryClient = useQueryClient();
  const [rangeType, setRangeType] = useState<DateRangeType>(DEFAULT_STATS_RANGE_TYPE);
  const [periodOffset, setPeriodOffset] = useState(0);
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
  const [chartView, setChartView] = useState<"trend" | "heatmap">("heatmap");

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
    queryKey: statsDescriptor.queryKey,
    queryFn: () => getEnhancedStats(statsDescriptor.input),
    enabled: ledgerId !== undefined && ledgerId !== "",
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });
  const { data: stats, isLoading, isError, refetch } = statsQuery;

  useEffect(() => {
    onQueryStateChange?.({
      ledgerId: ledgerId ?? "",
      tab: "stats",
      queryKey: statsDescriptor.queryKey,
      status: statsQuery.status,
      isFetching: statsQuery.isFetching,
    });
  }, [
    ledgerId,
    onQueryStateChange,
    statsDescriptor.queryKey,
    statsQuery.isFetching,
    statsQuery.status,
  ]);

  const handleRefresh = useCallback(async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  useRegisterPullToRefresh(handleRefresh);

  return (
    <StatsContentView
      rangeType={rangeType}
      onRangeTypeChange={(type) => {
        setRangeType(type);
        setPeriodOffset(0);
      }}
      periodOffset={periodOffset}
      onPeriodOffsetChange={setPeriodOffset}
      label={label}
      startDate={startDate}
      endDate={endDate}
      startDateStr={startDateStr}
      endDateStr={endDateStr}
      stats={stats}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      chartView={chartView}
      onChartViewChange={setChartView}
      fallbackCurrency={ledger?.settings.mainCurrency ?? "CNY"}
      {...(onCategoryDrilldown !== undefined ? { onCategoryDrilldown } : {})}
      {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
    />
  );
}
