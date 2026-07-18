import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

export type EnhancedCategoryStatDto = {
  id: string | null;
  name: string;
  icon: string | null;
  totalOriginal: string;
  totalConverted: string;
  currency: string;
  percent: number;
  count: number;
  trend: {
    percent: number;
    amount: string;
  };
};

export interface EnhancedStatsDto {
  summary: {
    total: string;
    currency: string;
    trend: {
      percent: number;
      amount: string;
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
