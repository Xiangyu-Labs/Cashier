/**
 * Adaptive Heatmap Component
 *
 * Pure heatmap visualization that adapts to data range size:
 * - <= 35 days: Large grid (40px cells) with date and amount visible
 * - > 35 days: Small grid (12px cells) GitHub-style with horizontal scroll
 */

"use client";
import { generateHeatmapDateKeys, resolveHeatmapRange } from "../../lib/heatmap-range";
import { LargeGridHeatmap } from "./LargeGrid";
import { SmallGridHeatmap } from "./SmallGrid";
import type { CalendarDayData, CalendarHeatmapStats } from "../../types";

interface AdaptiveHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  currency: string;
  locale: string;
  /**
   * Query range for the heatmap display.
   * If not provided, falls back to data-driven range.
   */
  queryRange?: {
    startDate: string;
    endDate: string;
  };
}

export function AdaptiveHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
  currency,
  locale,
}: AdaptiveHeatmapProps) {
  const dayCount = generateHeatmapDateKeys(resolveHeatmapRange(days, queryRange)).length;
  const optionalProps = {
    ...(onDayClick !== undefined ? { onDayClick } : {}),
    ...(className !== undefined ? { className } : {}),
    ...(queryRange !== undefined ? { queryRange } : {}),
    currency,
    locale,
  };

  // Use large grid for small ranges (<= 35 days), small grid for large ranges
  if (dayCount <= 35) {
    return <LargeGridHeatmap days={days} stats={stats} {...optionalProps} />;
  }

  return <SmallGridHeatmap days={days} stats={stats} {...optionalProps} />;
}

// Re-export sub-components for direct usage
export { SmallGridHeatmap };
