"use client";
import { useMemo, useState } from "react";
import { type DateRangeType, formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { buildChartPoints } from "@/modules/stats/lib/chart-points";

interface StatsChartProps {
  data: { date: string; total: number }[];
  rangeType: DateRangeType;
  startDate: Date;
  endDate: Date;
  isLoading?: boolean;
  currencySymbol?: string;
}

export function StatsChart({
  data = [],
  rangeType,
  startDate,
  endDate,
  isLoading,
  currencySymbol = "CNY",
}: StatsChartProps) {
  const locale = useLocale();
  const t = useTranslations("StatsChart");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // The queried range is already truncated to the ledger-timezone today by the
  // stats state; do not re-clamp with the browser clock here.
  const chartPoints = useMemo(() => {
    if (isLoading) return [];
    return buildChartPoints({
      data,
      rangeType,
      startDate: formatDateTimeForApi(startDate)!,
      endDate: formatDateTimeForApi(endDate)!,
      locale,
    });
  }, [data, endDate, isLoading, locale, rangeType, startDate]);

  // 计算95th percentile作为Y轴显示上限，处理异常值
  const { yAxisMax, hasOutliers } = useMemo(() => {
    if (chartPoints.length === 0) return { yAxisMax: 1, hasOutliers: false };

    const values = chartPoints.map((p) => p.value);
    const maxVal = Math.max(...values, 1);

    // 数据点少于10个时，使用最大值（避免过度压缩）
    if (values.length < 10) {
      return { yAxisMax: maxVal, hasOutliers: false };
    }

    // 计算95th percentile
    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Value = sorted[p95Index] ?? maxVal;

    // 如果95th percentile与最大值差距不大（<20%），直接使用最大值
    if (maxVal - p95Value < maxVal * 0.2) {
      return { yAxisMax: maxVal, hasOutliers: false };
    }

    // 确保封顶线至少是最大值的20%（避免过度拉伸）
    const yAxisMax = Math.max(p95Value, maxVal * 0.2);
    return { yAxisMax, hasOutliers: true };
  }, [chartPoints]);

  if (isLoading) {
    return <div className="h-48 w-full bg-surface2/30 animate-pulse rounded-lg" />;
  }

  if (chartPoints.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noData")}
      </div>
    );
  }

  // Calculate chart dimensions (chart area height)
  const chartHeight = 130; // pixels, matches h-full minus padding
  const paddingTop = 10; // 10% top padding
  const paddingBottom = 10; // 10% bottom padding
  const formatAmount = (value: number) => formatCurrencyAmount(value, currencySymbol, locale);

  return (
    <div className="w-full h-52 relative pt-6 pb-6 select-none">
      {/* Outlier indicator */}
      {hasOutliers && (
        <div className="absolute top-0 right-2 text-[10px] text-muted-foreground bg-surface2/50 px-2 py-0.5 rounded-full">
          {t("scaleAdjusted")}
        </div>
      )}
      {/* Grid Lines */}
      <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
        <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
        <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
        <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
      </div>

      {/* Chart Area - Using relative positioning for points */}
      <div className="h-full w-full px-2 relative" style={{ height: `${chartHeight}px` }}>
        {/* SVG for line only - stretched horizontally */}
        <svg
          className="absolute inset-0 w-full h-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Line Path */}
          {chartPoints.length > 1 && (
            <polyline
              points={chartPoints
                .map((p, i) => {
                  const xPercent =
                    chartPoints.length === 1 ? 50 : (i / (chartPoints.length - 1)) * 100;
                  // Calculate y position (inverted: 0 at top) using capped value
                  const displayValue = Math.min(p.value, yAxisMax);
                  const yPercent =
                    paddingTop + (1 - displayValue / yAxisMax) * (100 - paddingTop - paddingBottom);
                  return `${xPercent},${yPercent}`;
                })
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary transition-[color,stroke] duration-[var(--motion-state)] ease-[var(--motion-state-ease)]"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Points - Using absolute positioning with CSS (no SVG distortion) */}
        {chartPoints.map((p, i) => {
          const leftPercent = chartPoints.length === 1 ? 50 : (i / (chartPoints.length - 1)) * 100;
          // Calculate top position using capped value
          const isCapped = p.value > yAxisMax;
          const displayValue = Math.min(p.value, yAxisMax);
          const topPercent =
            paddingTop + (1 - displayValue / yAxisMax) * (100 - paddingTop - paddingBottom);

          // Format display date based on range type
          const displayDate =
            rangeType === "year"
              ? p.fullDate // YYYY-MM format
              : parseDateString(p.fullDate).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });

          const isHovered = hoveredIndex === i;

          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
              }}
            >
              {/* Data Point */}
              <button
                type="button"
                aria-label={`${displayDate}, ${t("expense")}: ${formatAmount(p.value)}`}
                aria-pressed={isHovered}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
                onClick={() => setHoveredIndex(isHovered ? null : i)}
                className={`
                    w-[7px] h-[7px] rounded-full bg-bg -translate-x-1/2 -translate-y-1/2
                    cursor-pointer transition-[color,background-color,border-color,opacity] duration-[var(--motion-feedback)]
                    ${
                      isCapped
                        ? 'border-2 border-danger after:content-["↑"] after:absolute after:-top-4 after:left-1/2 after:-translate-x-1/2 after:text-[10px] after:text-danger'
                        : "border-2 border-primary hover:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/50"
                    }
                  `}
              />

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
                  <div className="font-medium">{displayDate}</div>
                  <div className={isCapped ? "text-danger" : ""}>
                    {t("expense")}: {formatAmount(p.value)}
                    {isCapped && t("exceedsLimit")}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* X Axis Labels */}
      <div className="relative mt-2 h-6 w-full px-2">
        {chartPoints.map((p, i) => {
          // Label Filtering
          let showLabel = false;
          if (rangeType === "week" || rangeType === "year") {
            showLabel = true;
          } else if (rangeType === "month") {
            // Show 1, 6, 11, 16, 21, 26, 31 (Every 5 days + last day?)
            if (i === 0 || i === chartPoints.length - 1 || i % 5 === 0) {
              showLabel = true;
            }
          }

          if (!showLabel) return null;

          const leftPos = chartPoints.length === 1 ? 50 : (i / (chartPoints.length - 1)) * 100;

          return (
            <div
              key={i}
              className="absolute text-[10px] text-muted-foreground transform -translate-x-1/2 text-center w-8"
              style={{ left: `${leftPos}%` }}
            >
              {p.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
