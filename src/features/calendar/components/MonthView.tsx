/**
 * Month View Component
 *
 * Monthly calendar view with heatmap visualization.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HeatmapCell } from './HeatmapCell';
import { getMonthGrid, getWeekdayName } from '../lib/date-utils';
import type { CalendarHeatmapData } from '../types';

interface MonthViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  className?: string;
}

export function MonthView({ anchorDate, data, onDayClick, className }: MonthViewProps) {
  const grid = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);

  // Create a map of date -> day data for quick lookup
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    data.days.forEach((day) => {
      map.set(day.date, { amount: day.totalAmount, count: day.entryCount });
    });
    return map;
  }, [data.days]);

  // Weekday headers
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map(({ date, isCurrentMonth, isToday }) => {
          const dayData = dayDataMap.get(date);
          const amount = dayData?.amount || 0;
          const count = dayData?.count || 0;

          return (
            <HeatmapCell
              key={date}
              date={date}
              amount={amount}
              count={count}
              stats={data.stats}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              size="md"
              onClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}
