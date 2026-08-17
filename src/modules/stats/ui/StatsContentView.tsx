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
  isError?: boolean;
  onRetry?: () => void;
  chartView: "trend" | "heatmap";
  onChartViewChange: (view: "trend" | "heatmap") => void;
  fallbackCurrency?: string;
  onCategoryDrilldown?: (categoryId: string, startDate: string, endDate: string) => void;
  onDateDrilldown?: (date: string) => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
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
  isError = false,
  onRetry,
  chartView,
  onChartViewChange,
  fallbackCurrency = "CNY",
  onCategoryDrilldown,
  onDateDrilldown,
  onRefresh,
  readOnly = false,
}: StatsContentViewProps) {
  const t = useTranslations("StatsTab");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const currencySymbol = stats?.summary.currency ?? fallbackCurrency;
  const periodLabel =
    rangeType === "week" ? t("lastWeek") : rangeType === "month" ? t("lastMonth") : t("lastYear");
  const statsTrend = stats?.summary.trend;
  const trend =
    statsTrend == null
      ? undefined
      : { percent: statsTrend.percent, amount: Number(statsTrend.amount) };
  const comparison = stats?.summary.comparison;

  if (isError && stats == null) {
    return (
      <div className="space-y-6 pb-24">
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-8 text-center"
        >
          <p className="text-sm text-foreground">{t("loadFailed")}</p>
          {onRetry != null ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-24" aria-busy={isLoading}>
      {isLoading && stats != null ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        >
          <span className="rounded-full border bg-surface/95 px-3 py-1 text-xs text-muted-foreground shadow-sm">
            {tCommon("loading")}
          </span>
        </div>
      ) : null}
      {isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm"
        >
          <span className="text-danger">{t("loadFailed")}</span>
          {onRetry != null ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
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
        {...(onRefresh !== undefined ? { onRefresh } : {})}
        readOnly={readOnly}
        isLoading={isLoading && stats == null}
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
              disabled={readOnly}
              aria-pressed={chartView === "heatmap"}
              className="h-7 px-2"
            >
              <Grid3X3 className="mr-1 h-4 w-4" />
              {t("heatmap")}
            </Button>
            <Button
              variant={chartView === "trend" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChartViewChange("trend")}
              disabled={readOnly}
              aria-pressed={chartView === "trend"}
              className="h-7 px-2"
            >
              <BarChart3 className="mr-1 h-4 w-4" />
              {t("trend")}
            </Button>
          </div>
        </div>
        {stats == null ? (
          <div
            className="h-64 animate-pulse rounded-lg border border-border bg-surface2/60"
            data-testid="stats-visualization-skeleton"
          />
        ) : chartView === "trend" ? (
          <StatsChart
            data={stats.chart}
            rangeType={rangeType}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            currencySymbol={currencySymbol}
          />
        ) : (
          <CalendarHeatmapSection
            days={stats.heatmap.days}
            stats={stats.heatmap.stats}
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
