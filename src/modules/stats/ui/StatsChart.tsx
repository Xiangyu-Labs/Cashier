"use client";

import { useMemo, useState } from "react";
import { type DateRangeType, formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { useLocale, useTranslations } from "next-intl";

interface StatsChartProps {
  data: { date: string; total: number }[];
  rangeType: DateRangeType;
  startDate: Date;
  endDate: Date;
  isLoading?: boolean;
}

export function StatsChart({
  data = [],
  rangeType,
  startDate,
  endDate,
  isLoading,
}: StatsChartProps) {
  const locale = useLocale();
  const t = useTranslations("StatsChart");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Find the latest date with actual data
  const latestDataDate = useMemo(() => {
    if (data.length === 0) return null;
    const sortedDates = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return sortedDates[sortedDates.length - 1]?.date ?? null;
  }, [data]);

  // Process Data based on Range Type
  const chartPoints = useMemo(() => {
    if (isLoading) return [];

    const points: { label: string; value: number; fullDate: string }[] = [];

    // Get today's date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (rangeType === "year") {
      // Aggregate by Month - show up to max(latest data month, current month)
      const year = startDate.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12

      // Find month with latest data
      let dataMaxMonth = currentMonth;
      if (latestDataDate != null && latestDataDate.startsWith(String(year))) {
        const [, monthPart] = latestDataDate.split("-");
        if (monthPart != null) {
          const parsedMonth = Number.parseInt(monthPart, 10);
          if (!Number.isNaN(parsedMonth)) {
            dataMaxMonth = parsedMonth;
          }
        }
      }

      // Show up to the later of: current month or month with latest data
      const maxMonth = Math.max(currentMonth, dataMaxMonth);

      for (let month = 0; month < maxMonth; month++) {
        // Determine pattern for this month: "YYYY-MM"
        const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

        // Sum all entries starting with this prefix
        const total = data
          .filter((d) => d.date.startsWith(monthPrefix))
          .reduce((sum, d) => sum + d.total, 0);

        const monthLabel = new Date(year, month, 1).toLocaleString(locale, { month: "short" });

        points.push({
          label: monthLabel,
          value: total,
          fullDate: monthPrefix, // Just for key/ref
        });
      }
    } else {
      // Daily granularity (Week or Month) - show up to max(latest data, today)
      const curr = new Date(startDate);

      // End date is the later of: today or latest data date
      let effectiveEndDate: Date;
      if (latestDataDate != null) {
        const latestDate = new Date(latestDataDate);
        effectiveEndDate = latestDate > today ? latestDate : today;
      } else {
        effectiveEndDate = today;
      }

      // Don't exceed original endDate (for future periods)
      const originalEnd = new Date(endDate);
      const end = effectiveEndDate < originalEnd ? effectiveEndDate : originalEnd;

      // Safety break to prevent infinite loops if dates are weird
      let safety = 0;
      while (curr <= end && safety < 400) {
        const dateStr = formatDateTimeForApi(curr);
        const found = data.find((d) => d.date === dateStr);

        let label = "";
        if (rangeType === "week") {
          label = curr.toLocaleString(locale, { weekday: "short" });
        } else {
          // Day number for Month view
          label = String(curr.getDate());
        }

        points.push({
          label,
          value: found ? found.total : 0,
          fullDate: dateStr,
        });

        curr.setDate(curr.getDate() + 1);
        safety++;
      }
    }
    return points;
  }, [data, rangeType, startDate, endDate, isLoading, locale, latestDataDate]);

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

  if (chartPoints.length === 0) return null;

  // Calculate chart dimensions (chart area height)
  const chartHeight = 130; // pixels, matches h-full minus padding
  const paddingTop = 10; // 10% top padding
  const paddingBottom = 10; // 10% bottom padding

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
              className="text-primary transition-all duration-300 ease-in-out"
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
              <div
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => setHoveredIndex(isHovered ? null : i)}
                className={`
                                    w-[7px] h-[7px] rounded-full bg-bg -translate-x-1/2 -translate-y-1/2
                                    transition-all duration-300 cursor-pointer
                                    ${
                                      isCapped
                                        ? 'border-2 border-red-500 after:content-["↑"] after:absolute after:-top-4 after:left-1/2 after:-translate-x-1/2 after:text-[10px] after:text-red-500'
                                        : "border-2 border-primary hover:scale-125"
                                    }
                                `}
              />

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
                  <div className="font-medium">{displayDate}</div>
                  <div className={isCapped ? "text-red-500" : ""}>
                    {t("expense")}: ¥{p.value.toLocaleString()}
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
