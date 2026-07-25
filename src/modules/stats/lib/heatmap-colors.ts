/**
 * Heatmap Color Utilities
 *
 * Color mapping logic for calendar heatmap visualization.
 * Uses CSS custom properties (tokens) for theming support.
 */

import type { CalendarHeatmapStats, HeatmapLevel } from "../types";

// Heatmap color configuration using CSS custom property tokens
const HEATMAP_TOKEN_COLORS: Record<HeatmapLevel, string> = {
  0: "var(--heatmap-0)",
  1: "var(--heatmap-1)",
  2: "var(--heatmap-2)",
  3: "var(--heatmap-3)",
  4: "var(--heatmap-4)",
  5: "var(--heatmap-5)",
};

const HEATMAP_LABELS: Record<HeatmapLevel, string> = {
  0: "无消费",
  1: "很少",
  2: "较少",
  3: "中等",
  4: "较多",
  5: "很多",
};

/**
 * Get heatmap level (0-5) based on amount and stats
 * Uses P80 as the upper bound to avoid extreme values compressing the scale
 */
export function getHeatmapLevel(amount: number, stats: CalendarHeatmapStats): HeatmapLevel {
  if (amount <= 0) return 0;

  // Use P80 as the effective max to handle outliers
  const effectiveMax = Math.max(stats.p80Amount, stats.avgAmount * 2);

  // Guard against division by zero
  if (effectiveMax <= 0) return 0;

  const ratio = Math.min(amount / effectiveMax, 1);

  if (ratio < 0.1) return 1;
  if (ratio < 0.25) return 2;
  if (ratio < 0.5) return 3;
  if (ratio < 0.75) return 4;
  return 5;
}

/**
 * Get color for a heatmap level
 */
export function getHeatmapColor(level: HeatmapLevel): string {
  return HEATMAP_TOKEN_COLORS[level] ?? HEATMAP_TOKEN_COLORS[0];
}

function getHeatmapLabel(level: HeatmapLevel): string {
  return HEATMAP_LABELS[level];
}

/**
 * Get all heatmap legend items
 */
export function getHeatmapLegend() {
  const levels: HeatmapLevel[] = [0, 1, 2, 3, 4, 5];
  return levels.map((level) => ({
    level,
    color: getHeatmapColor(level),
    label: getHeatmapLabel(level),
  }));
}

/**
 * Format amount for display in cell (abbreviated, localized currency symbol)
 */
export function formatCellAmount(amount: number, currency = "CNY", locale = "zh-CN"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    // Fallback: if currency is invalid/unsupported, format with ISO code prefix
    return `${currency} ${new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount)}`;
  }
}
