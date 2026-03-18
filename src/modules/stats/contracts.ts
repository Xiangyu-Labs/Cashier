import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

export type EnhancedCategoryStatDto = {
  id: string | null;
  name: string;
  icon: string | null;
  totalOriginal: number;
  totalConverted: number;
  currency: string;
  percent: number;
  count: number;
  trend: {
    percent: number;
    amount: number;
  };
};

export interface EnhancedStatsDto {
  summary: {
    total: number;
    currency: string;
    trend: {
      percent: number;
      amount: number;
    };
    dailyAverage: number;
  };
  categories: EnhancedCategoryStatDto[];
  chart: { date: string; total: number }[];
  heatmap: {
    days: CalendarDayData[];
    stats: CalendarHeatmapStats;
  };
}
