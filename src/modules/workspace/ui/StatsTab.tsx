"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnhancedStats } from "@/modules/stats/actions";
import { invalidateCalendar, invalidateLedgerStats, queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
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
import {
  DEFAULT_STATS_RANGE_TYPE,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";

interface StatsTabProps {
  ledgerId?: string;
  ledger?: Ledger;
  onCategoryDrilldown?: (categoryId: string, startDate: string, endDate: string) => void;
  onDateDrilldown?: (date: string) => void;
  initialDate?: Date;
  timeZone?: string;
}

export function StatsTab({
  ledgerId,
  ledger,
  onCategoryDrilldown,
  onDateDrilldown,
  initialDate,
  timeZone,
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

  const {
    startDate,
    endDate,
    prevDateStart: _prevDateStart,
    prevDateEnd: _prevDateEnd,
    startDateStr,
    endDateStr,
    prevDateStartStr,
    prevDateEndStr,
  } = useMemo(() => getStatsInitialQueryState(currentDate, rangeType), [currentDate, rangeType]);

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

  const enhancedStatsKey = queryKeys.enhancedStats(ledgerId ?? "", {
    startDate: startDateStr,
    endDate: endDateStr,
    compareStartDate: prevDateStartStr,
    compareEndDate: prevDateEndStr,
    rangeType,
    ...(ledger?.settings.mainCurrency !== undefined
      ? { mainCurrency: ledger.settings.mainCurrency }
      : {}),
  });
  const { data: stats, isLoading } = useQuery({
    queryKey: enhancedStatsKey,
    queryFn: () =>
      getEnhancedStats({
        ledgerId: ledgerId ?? "",
        queryRange: {
          from: startDateStr,
          to: endDateStr,
        },
        compareRange: {
          from: prevDateStartStr,
          to: prevDateEndStr,
        },
      }),
    enabled: ledgerId !== undefined && ledgerId !== "",
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });

  const handleRefresh = useCallback(async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
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
        chartView={chartView}
        onChartViewChange={setChartView}
        fallbackCurrency={ledger?.settings.mainCurrency ?? "CNY"}
        {...(onCategoryDrilldown !== undefined ? { onCategoryDrilldown } : {})}
        {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
      />
    </PullToRefresh>
  );
}
