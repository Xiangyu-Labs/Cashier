/**
 * Shared Calendar Types
 *
 * Used by both calendar and stats features.
 * This avoids cross-feature imports.
 */

export interface CalendarDayData {
  date: string; // yyyy-MM-dd
  totalAmount: string;
  entryCount: number;
  currencies: string[];
}

export interface CalendarHeatmapStats {
  minAmount: string;
  maxAmount: string;
  avgAmount: string;
  p80Amount: string; // 80th percentile for color mapping
}
