"use client";

import { BarChart3, Grid3X3 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { DateRangeType } from "@/lib/date-utils";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";
import { CalendarHeatmapSection } from "./CalendarHeatmapSection";
import { StatsChart } from "./StatsChart";
import { StatsHeader } from "./StatsHeader";
import { StatsRanking } from "./StatsRanking";

interface StatsContentViewProps {
  rangeType: DateRangeType;
  onRangeTypeChange: (rangeType: DateRangeType) => void;
  periodOffset: number;
  onPeriodOffsetChange: (offset: number) => void;
  label: string;
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
  stats: EnhancedStatsDto | undefined;
  isLoading?: boolean;
  chartView: "trend" | "heatmap";
  onChartViewChange: (view: "trend" | "heatmap") => void;
  fallbackCurrency?: string;
  onCategoryDrilldown?: (categoryId: string, startDate: string, endDate: string) => void;
  onDateDrilldown?: (date: string) => void;
}

export function StatsContentView({
  rangeType,
  onRangeTypeChange,
  periodOffset,
  onPeriodOffsetChange,
  label,
  startDate,
  endDate,
  startDateStr,
  endDateStr,
  stats,
  isLoading = false,
  chartView,
  onChartViewChange,
  fallbackCurrency = "CNY",
  onCategoryDrilldown,
  onDateDrilldown,
}: StatsContentViewProps) {
  const t = useTranslations("StatsTab");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const currencySymbol = stats?.summary.currency ?? fallbackCurrency;
  const periodLabel = t(
    rangeType === "week" ? "lastWeek" : rangeType === "month" ? "lastMonth" : "lastYear"
  );
  const statsTrend = stats?.summary.trend;
  const trend =
    statsTrend == null
      ? undefined
      : { percent: statsTrend.percent, amount: Number(statsTrend.amount) };
  const comparison = stats?.summary.comparison;

  return (
    <div className="space-y-6 pb-24">
      <StatsHeader
        rangeType={rangeType}
        setRangeType={onRangeTypeChange}
        periodOffset={periodOffset}
        setPeriodOffset={onPeriodOffsetChange}
        label={label}
        totalExpense={Number(stats?.summary.total ?? 0)}
        averageDaily={stats?.summary.dailyAverage ?? 0}
        currencySymbol={currencySymbol}
        periodLabel={periodLabel}
        {...(comparison !== undefined ? { comparison } : {})}
        {...(trend !== undefined ? { trend } : {})}
      />
      {stats?.unconvertedCount != null && stats.unconvertedCount > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {tCommon("incompleteAccountingProjection")}
        </div>
      ) : null}

      <div className="min-w-0 space-y-2 px-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {chartView === "trend" ? t("expenseTrend") : t("dailyHeatmap")}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant={chartView === "heatmap" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChartViewChange("heatmap")}
              className="h-7 px-2"
            >
              <Grid3X3 className="mr-1 h-4 w-4" />
              {t("heatmap")}
            </Button>
            <Button
              variant={chartView === "trend" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChartViewChange("trend")}
              className="h-7 px-2"
            >
              <BarChart3 className="mr-1 h-4 w-4" />
              {t("trend")}
            </Button>
          </div>
        </div>
        {chartView === "trend" ? (
          <StatsChart
            data={stats?.chart ?? []}
            rangeType={rangeType}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            currencySymbol={currencySymbol}
          />
        ) : (
          <CalendarHeatmapSection
            days={stats?.heatmap.days ?? []}
            stats={
              stats?.heatmap.stats ?? {
                minAmount: 0,
                maxAmount: 0,
                avgAmount: 0,
                p80Amount: 0,
              }
            }
            {...(onDateDrilldown !== undefined ? { onDateDrilldown } : {})}
            currency={currencySymbol}
            locale={locale}
            queryRange={{ startDate: startDateStr, endDate: endDateStr }}
          />
        )}
      </div>

      <StatsRanking
        data={(stats?.categories ?? []).map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          totalConverted: Number(category.totalConverted),
          percent: category.percent,
          count: category.count,
          trend: {
            percent: category.trend.percent,
            amount: Number(category.trend.amount),
          },
        }))}
        isLoading={isLoading}
        currencySymbol={currencySymbol}
        {...(onCategoryDrilldown !== undefined
          ? {
              onCategoryClick: (categoryId: string) =>
                onCategoryDrilldown(categoryId, startDateStr, endDateStr),
            }
          : {})}
      />
    </div>
  );
}
