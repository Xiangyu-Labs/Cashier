/**
 * Month View Component
 *
 * Monthly calendar view with heatmap visualization.
 * Clean, borderless design optimized for readability.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getMonthGrid, getWeekdayName, formatDate } from '../lib/date-utils';
import { getHeatmapLevel, getHeatmapColor, formatCellAmount } from '../lib/heatmap-colors';
import type { CalendarHeatmapData } from '../types';

interface MonthViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  className?: string;
}

export function MonthView({ anchorDate, data, onDayClick, className }: MonthViewProps) {
  const grid = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);
  const today = formatDate(new Date());

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
      <div className="grid grid-cols-7 gap-1 mb-3">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid - borderless, clean design */}
      <div className="grid grid-cols-7 gap-1.5">
        {grid.map(({ date, isCurrentMonth, isToday: isTodayFlag }) => {
          const dayData = dayDataMap.get(date);
          const amount = dayData?.amount || 0;
          const count = dayData?.count || 0;
          const isToday = date === today;
          const level = getHeatmapLevel(amount, data.stats);
          const dayNumber = parseInt(date.split('-')[2], 10);

          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              className={cn(
                'relative flex flex-col items-center justify-start pt-1.5 rounded-lg transition-all duration-200',
                'h-16 min-h-[4rem]',
                'hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary',
                !isCurrentMonth && 'opacity-30',
                isToday && 'ring-2 ring-primary ring-offset-2'
              )}
              style={{
                backgroundColor: getHeatmapColor(level),
              }}
            >
              {/* Day number - top center */}
              <span
                className={cn(
                  'text-xs font-medium leading-none',
                  level >= 4 ? 'text-white' : 'text-foreground'
                )}
              >
                {dayNumber}
              </span>

              {/* Amount - center (if has data) */}
              {amount > 0 && (
                <span
                  className={cn(
                    'mt-1 text-sm font-semibold leading-tight',
                    level >= 4 ? 'text-white' : 'text-foreground'
                  )}
                >
                  {formatCellAmount(amount)}
                </span>
              )}

              {/* Count indicator (only if no amount or small amount) */}
              {count > 0 && amount === 0 && (
                <span
                  className={cn(
                    'mt-1 text-[10px]',
                    level >= 4 ? 'text-white/80' : 'text-muted-foreground'
                  )}
                >
                  {count}笔
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
