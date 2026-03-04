/**
 * Week View Component
 *
 * Weekly calendar view with horizontal bar chart visualization.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getWeekDates, parseDate, formatDate } from '../lib/date-utils';
import { getHeatmapLevel, getHeatmapColor, formatCellAmount } from '../lib/heatmap-colors';
import type { CalendarHeatmapData } from '../types';

interface WeekViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  className?: string;
}

export function WeekView({ anchorDate, data, onDayClick, className }: WeekViewProps) {
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);

  // Create a map of date -> day data for quick lookup
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    data.days.forEach((day) => {
      map.set(day.date, { amount: day.totalAmount, count: day.entryCount });
    });
    return map;
  }, [data.days]);

  // Calculate max amount for bar scaling
  const maxAmount = useMemo(() => {
    const amounts = data.days.map((d) => d.totalAmount).filter((a) => a > 0);
    return amounts.length > 0 ? Math.max(...amounts) : 1;
  }, [data.days]);

  // Weekday names
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const today = formatDate(new Date());

  return (
    <div className={cn('grid grid-cols-7 gap-2', className)}>
      {weekDates.map((date, index) => {
        const dayData = dayDataMap.get(date);
        const amount = dayData?.amount || 0;
        const count = dayData?.count || 0;
        const isToday = date === today;
        const level = getHeatmapLevel(amount, data.stats);

        // Calculate bar height percentage
        const barHeight = amount > 0 ? Math.max((amount / maxAmount) * 100, 8) : 0;

        return (
          <button
            key={date}
            onClick={() => onDayClick(date)}
            className={cn(
              'flex flex-col items-center p-3 rounded-lg border transition-all duration-200',
              'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary',
              isToday && 'ring-2 ring-primary ring-offset-1'
            )}
            style={{
              borderColor: isToday ? 'hsl(var(--primary))' : 'hsl(var(--border))',
            }}
          >
            {/* Day name and date */}
            <div className="text-center mb-3">
              <div className="text-xs text-muted-foreground">{weekdays[index]}</div>
              <div
                className={cn(
                  'text-lg font-semibold mt-1',
                  isToday && 'text-primary'
                )}
              >
                {parseInt(date.split('-')[2], 10)}
              </div>
            </div>

            {/* Bar chart */}
            <div className="flex-1 w-full flex items-end justify-center min-h-[120px]">
              {amount > 0 ? (
                <div
                  className="w-12 rounded-t-md transition-all duration-300"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: getHeatmapColor(level),
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground">无消费</div>
              )}
            </div>

            {/* Amount label */}
            {amount > 0 && (
              <div className="mt-3 text-center">
                <div className="font-semibold text-sm">{formatCellAmount(amount)}</div>
                <div className="text-xs text-muted-foreground">{count}笔</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
