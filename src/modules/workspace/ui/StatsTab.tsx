"use client";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnhancedStats } from "@/modules/stats/actions";
import { invalidateCalendar, invalidateLedgerStats, queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { getDateInTimezone, parseDateString, type DateRangeType } from "@/lib/date-utils";
import { CalendarHeatmapSection, StatsChart, StatsHeader, StatsRanking } from "@/modules/stats/ui";
import { useTranslations, useFormatter, useLocale } from "next-intl";
import { BarChart3, Grid3X3 } from "lucide-react";
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
  const t = useTranslations("StatsTab");
  const format = useFormatter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [rangeType, setRangeType] = useState<DateRangeType>(DEFAULT_STATS_RANGE_TYPE);
  // Use initialDate from props to avoid hydration mismatch between server and client
  const [currentDate, setCurrentDate] = useState(() => {
    const zonedDate = getDateInTimezone(timeZone);
    if (zonedDate != null) return parseDateString(zonedDate);
    return initialDate ?? new Date();
  });
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
        return `${format.dateTime(startDate, { month: "numeric", day: "numeric" })} - ${format.dateTime(endDate, { month: "numeric", day: "numeric" })}`;
      case "month":
        return format.dateTime(startDate, { year: "numeric", month: "long" });
      case "year":
        return format.dateTime(startDate, { year: "numeric" });
      default:
        return "";
    }
  }, [startDate, endDate, rangeType, format]);

  const enhancedStatsKey = queryKeys.enhancedStats(ledgerId ?? "", {
    startDate: startDateStr,
    rangeType,
    ...(ledger?.metadata?.settings?.mainCurrency !== undefined
      ? { mainCurrency: ledger.metadata.settings.mainCurrency }
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

  const totalExpense = Number(stats?.summary.total ?? 0);
  const currencySymbol =
    stats?.summary.currency ?? ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const averageDaily = stats?.summary.dailyAverage ?? 0;
  const statsTrend = stats?.summary.trend;
  const trend =
    statsTrend !== undefined
      ? { percent: statsTrend.percent, amount: Number(statsTrend.amount) }
      : undefined;

  const handleRefresh = useCallback(async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  const handleCategoryClick = (categoryId: string) => {
    if (onCategoryDrilldown !== undefined) {
      onCategoryDrilldown(categoryId, startDateStr, endDateStr);
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6 pb-24">
        <StatsHeader
          rangeType={rangeType}
          setRangeType={setRangeType}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          label={label}
          totalExpense={totalExpense}
          averageDaily={averageDaily}
          currencySymbol={currencySymbol}
          {...(trend !== undefined ? { trend } : {})}
          {...(timeZone != null ? { timeZone } : {})}
        />

        <div className="min-w-0 space-y-2 px-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {chartView === "trend" ? t("expenseTrend") : t("dailyHeatmap")}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant={chartView === "heatmap" ? "default" : "ghost"}
                size="sm"
                onClick={() => setChartView("heatmap")}
                className="h-7 px-2"
              >
                <Grid3X3 className="h-4 w-4 mr-1" />
                {t("heatmap")}
              </Button>
              <Button
                variant={chartView === "trend" ? "default" : "ghost"}
                size="sm"
                onClick={() => setChartView("trend")}
                className="h-7 px-2"
              >
                <BarChart3 className="h-4 w-4 mr-1" />
                {t("trend")}
              </Button>
            </div>
          </div>
          {chartView === "trend" ? (
            <StatsChart
              data={stats?.chart || []}
              rangeType={rangeType}
              startDate={startDate}
              endDate={endDate}
              isLoading={isLoading}
              currencySymbol={currencySymbol}
            />
          ) : (
            <CalendarHeatmapSection
              days={stats?.heatmap?.days || []}
              stats={
                stats?.heatmap?.stats || { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 }
              }
              {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
              currency={currencySymbol}
              locale={locale}
              queryRange={{
                startDate: startDateStr,
                endDate: endDateStr,
              }}
            />
          )}
        </div>

        <StatsRanking
          data={(stats?.categories ?? []).map((c) => {
            const base = {
              id: c.id,
              name: c.name,
              icon: c.icon,
              totalConverted: Number(c.totalConverted),
              percent: c.percent,
              count: c.count,
            };
            return c.trend
              ? { ...base, trend: { percent: c.trend.percent, amount: Number(c.trend.amount) } }
              : base;
          })}
          isLoading={isLoading}
          currencySymbol={currencySymbol}
          onCategoryClick={handleCategoryClick}
        />
      </div>
    </PullToRefresh>
  );
}
