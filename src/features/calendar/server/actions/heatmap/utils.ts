/**
 * Heatmap Utilities
 *
 * Helper functions for heatmap calculations and date handling.
 */

import type { CalendarViewType } from "../../../types";

/**
 * Calculate date range based on view type and anchor date
 */
export function getDateRange(
  viewType: CalendarViewType,
  anchorDate: string
): { startDate: string; endDate: string } {
  const [year, month] = anchorDate.split("-").map(Number);

  switch (viewType) {
    case "month": {
      const end = new Date(year, month, 0);
      return {
        startDate: `${year}-${String(month).padStart(2, "0")}-01`,
        endDate: `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
      };
    }
    case "year": {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      };
    }
  }
}

/**
 * Normalize date string to yyyy-MM-dd format
 */
export function normalizeDate(dateStr: string): string {
  const datePart = dateStr.split("T")[0].split(" ")[0];
  const parts = datePart.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!parts) {
    return dateStr;
  }

  const [, year, month, day] = parts;
  return `${year}-${String(parseInt(month, 10)).padStart(2, "0")}-${String(parseInt(day, 10)).padStart(2, "0")}`;
}

/**
 * Calculate statistics for heatmap color mapping
 */
export function calculateStats(amounts: number[]) {
  if (amounts.length === 0) {
    return {
      minAmount: 0,
      maxAmount: 0,
      avgAmount: 0,
      p80Amount: 0,
    };
  }

  const sorted = [...amounts].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const p80Index = Math.floor(sorted.length * 0.8);
  const p80 = sorted[p80Index] ?? max;

  return {
    minAmount: min,
    maxAmount: max,
    avgAmount: avg,
    p80Amount: p80,
  };
}
