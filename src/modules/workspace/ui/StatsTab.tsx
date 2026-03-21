"use client";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnhancedStats } from "@/modules/stats/actions";
import { invalidateCalendar, invalidateLedgerStats, queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { type DateRangeType } from "@/lib/date-utils";
import { CalendarHeatmapSection, StatsChart, StatsHeader, StatsRanking, } from "@/modules/stats/ui";
import { useTranslations, useFormatter } from "next-intl";
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
}

export function StatsTab({
  ledgerId,
  ledger,
  onCategoryDrilldown,
  onDateDrilldown,
  initialDate,
}: StatsTabProps) {
  const t = useTranslations("StatsTab");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [rangeType, setRangeType] = useState<DateRangeType>(DEFAULT_STATS_RANGE_TYPE);
  // Use initialDate from props to avoid hydration mismatch between server and client
  const [currentDate, setCurrentDate] = useState(initialDate || new Date());
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

  const enhancedStatsKey = [
    ...queryKeys.enhancedStats(ledgerId ?? ""),
    startDateStr,
    rangeType,
    ledger?.metadata?.settings?.mainCurrency,
  ];
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

  const totalExpense = stats?.summary.total ?? 0;
  const currencySymbol =
    stats?.summary.currency ?? ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const averageDaily = stats?.summary.dailyAverage ?? 0;
  const trend = stats?.summary.trend;

  const handleRefresh = async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  };

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
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
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
            />
          ) : (
            <CalendarHeatmapSection
              days={stats?.heatmap?.days || []}
              stats={
                stats?.heatmap?.stats || { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 }
              }
              {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
              queryRange={{
                startDate: startDateStr,
                endDate: endDateStr,
              }}
            />
          )}
        </div>

        <StatsRanking
          data={stats?.categories || []}
          isLoading={isLoading}
          currencySymbol={currencySymbol}
          onCategoryClick={handleCategoryClick}
        />
      </div>
    </PullToRefresh>
  );
}
