/**
 * Calendar Heatmap Section
 *
 * Pure heatmap visualization for StatsTab.
 * Shows spending intensity over time with adaptive display:
 * - Small range: Large grid cells with date/amount
 * - Large range: Small GitHub-style cells with horizontal scroll
 *
 * No calendar features - just a pure heatmap.
 */

"use client";
import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AdaptiveHeatmap } from "./AdaptiveHeatmap";
import { getHeatmapLegend } from "../lib/heatmap-colors";
import type { CalendarDayData, CalendarHeatmapStats } from "../types";

const HEATMAP_LABEL_KEYS = [
  "heatmapLevel0",
  "heatmapLevel1",
  "heatmapLevel2",
  "heatmapLevel3",
  "heatmapLevel4",
  "heatmapLevel5",
] as const;

interface CalendarHeatmapSectionProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDateDrilldown?: (date: string) => void;
  className?: string;
  currency?: string;
  locale?: string;
  /**
   * Query range for the heatmap display.
   * If not provided, falls back to data-driven range.
   */
  queryRange?: {
    startDate: string;
    endDate: string;
  };
}

export function CalendarHeatmapSection({
  days,
  stats,
  onDateDrilldown,
  className,
  queryRange,
  currency = "CNY",
  locale = "zh-CN",
}: CalendarHeatmapSectionProps) {
  const t = useTranslations("Calendar");

  // Handle day click
  const handleDayClick = useCallback(
    (date: string) => {
      if (onDateDrilldown) {
        onDateDrilldown(date);
      }
    },
    [onDateDrilldown]
  );

  // Legend items
  const legend = useMemo(() => getHeatmapLegend(), []);

  // No data state
  if (days.length === 0 && queryRange == null) {
    return (
      <div
        className={cn(
          "h-[200px] flex items-center justify-center text-muted-foreground text-sm bg-surface rounded-lg",
          className
        )}
      >
        {t("noData")}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Heatmap grid */}
      <AdaptiveHeatmap
        days={days}
        stats={stats}
        onDayClick={handleDayClick}
        currency={currency}
        locale={locale}
        {...(queryRange !== undefined ? { queryRange } : {})}
      />

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground">{t("less")}</span>
        <div className="flex gap-1">
          {legend.map((item) => (
            <div
              key={item.level}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: item.color }}
              title={t(HEATMAP_LABEL_KEYS[item.level])}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("more")}</span>
      </div>
    </div>
  );
}
