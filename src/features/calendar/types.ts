/**
 * Calendar Heatmap Types
 *
 * Type definitions for calendar heatmap feature.
 */

export type CalendarViewType = 'month' | 'year';

export interface CalendarFilters {
    currency?: string;
    categoryId?: string;
}

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

export interface CalendarHeatmapData {
    days: CalendarDayData[];
    range: {
        startDate: string;
        endDate: string;
    };
    stats: CalendarHeatmapStats;
}

export interface CalendarDayDetailEntry {
    id: string;
    itemName: string;
    amount: number;
    currency: string;
    convertedAmount?: number;
    categoryId?: string;
    categoryName?: string;
    categoryIcon?: string;
    sourceDocumentId: string;
    sourceDocumentTitle?: string;
}

export interface CalendarDayDetailResponse {
    date: string;
    entries: CalendarDayDetailEntry[];
    totalAmount: number;
    totalCount: number;
}

// Heatmap color level (0-5)
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface HeatmapColorConfig {
    level: HeatmapLevel;
    color: string;
    label: string;
}
