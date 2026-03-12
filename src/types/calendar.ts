/**
 * Shared Calendar Types
 *
 * Used by both calendar and stats features.
 * This avoids cross-feature imports.
 */

export interface CalendarDayData {
    date: string; // yyyy-MM-dd
    totalAmount: number;
    entryCount: number;
    currencies: string[];
}

export interface CalendarHeatmapStats {
    minAmount: number;
    maxAmount: number;
    avgAmount: number;
    p80Amount: number; // 80th percentile for color mapping
}
