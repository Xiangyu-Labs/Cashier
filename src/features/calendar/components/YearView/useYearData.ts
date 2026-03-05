/**
 * Year View Data Hook
 *
 * Calculates year heatmap data including weeks grid, month labels, and statistics.
 */

import { useMemo } from 'react';
import { getHeatmapLevel } from '../../lib/heatmap-colors';
import { formatDate } from '../../lib/date-utils';
import type { CalendarHeatmapData, CalendarDayData } from '../../types';

interface DayCellData {
  date: string;
  amount: number;
  count: number;
  level: number;
  isInYear: boolean;
}

interface WeekData {
  weekIndex: number;
  days: DayCellData[];
}

interface MonthLabel {
  month: number;
  weekIndex: number;
  label: string;
}

interface YearStats {
  totalAmount: number;
  totalCount: number;
  avgDaily: number;
}

interface UseYearDataResult {
  weeks: WeekData[];
  monthLabels: MonthLabel[];
  stats: YearStats;
}

export function useYearData(
  year: number,
  data: CalendarHeatmapData
): UseYearDataResult {
  // Create a map of date -> day data for quick lookup
  const dayDataMap = useMemo(() => {
    const map = new Map<string, CalendarDayData>();
    data.days.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [data.days]);

  // Generate 53 weeks x 7 days grid
  const weeks = useMemo<WeekData[]>(() => {
    const weeksData: WeekData[] = [];

    // Find the first Monday of the year or the Monday of the week containing Jan 1
    const jan1 = new Date(year, 0, 1);
    const jan1DayOfWeek = jan1.getDay(); // 0 = Sunday, 1 = Monday, etc.
    // Adjust so Monday is the first day (0 = Monday, 6 = Sunday)
    const mondayOffset = jan1DayOfWeek === 0 ? 6 : jan1DayOfWeek - 1;
    const firstMonday = new Date(year, 0, 1 - mondayOffset);

    // Generate 53 weeks
    for (let weekIndex = 0; weekIndex < 53; weekIndex++) {
      const weekDays: DayCellData[] = [];

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const currentDate = new Date(firstMonday);
        currentDate.setDate(firstMonday.getDate() + weekIndex * 7 + dayIndex);

        const dateStr = formatDate(currentDate);
        const dayData = dayDataMap.get(dateStr);
        const isInYear = currentDate.getFullYear() === year;
        const amount = dayData?.totalAmount || 0;
        const count = dayData?.entryCount || 0;

        weekDays.push({
          date: dateStr,
          amount,
          count,
          level: getHeatmapLevel(amount, data.stats),
          isInYear,
        });
      }

      weeksData.push({
        weekIndex,
        days: weekDays,
      });
    }

    return weeksData;
  }, [year, dayDataMap, data.stats]);

  // Calculate month labels and their positions
  const monthLabels = useMemo<MonthLabel[]>(() => {
    const labels: MonthLabel[] = [];
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    for (let month = 0; month < 12; month++) {
      // Find the first day of this month
      const firstDayOfMonth = new Date(year, month, 1);
      // Find which week this day belongs to
      const jan1 = new Date(year, 0, 1);
      const jan1DayOfWeek = jan1.getDay();
      const mondayOffset = jan1DayOfWeek === 0 ? 6 : jan1DayOfWeek - 1;
      const firstMonday = new Date(year, 0, 1 - mondayOffset);

      const daysDiff = Math.floor(
        (firstDayOfMonth.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekIndex = Math.floor(daysDiff / 7);

      labels.push({
        month: month + 1,
        weekIndex: Math.max(0, weekIndex),
        label: monthNames[month],
      });
    }

    return labels;
  }, [year]);

  // Calculate statistics
  const stats = useMemo<YearStats>(() => {
    let totalAmount = 0;
    let totalCount = 0;
    let daysWithData = 0;

    data.days.forEach((day) => {
      if (day.date.startsWith(String(year))) {
        totalAmount += day.totalAmount;
        totalCount += day.entryCount;
        if (day.totalAmount > 0) {
          daysWithData++;
        }
      }
    });

    const avgDaily = daysWithData > 0 ? totalAmount / daysWithData : 0;

    return {
      totalAmount,
      totalCount,
      avgDaily,
    };
  }, [data.days, year]);

  return {
    weeks,
    monthLabels,
    stats,
  };
}
