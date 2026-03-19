import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

export type { CalendarDayData, CalendarHeatmapStats };

export type CalendarViewType = "month" | "year";

export interface CalendarFilters {
  currency?: string;
  categoryId?: string;
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
