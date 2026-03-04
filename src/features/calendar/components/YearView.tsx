/**
 * Year View Component
 *
 * Yearly calendar view with mini heatmaps for each month.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MiniHeatmapCell } from './HeatmapCell';
import {
  getMonthGrid,
  getMonthName,
  getDaysInMonth,
  getFirstDayOfMonth,
  formatDate,
} from '../lib/date-utils';
import type { CalendarHeatmapData, CalendarDayData } from '../types';

interface YearViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  onMonthClick: (month: number) => void;
  className?: string;
}

export function YearView({ anchorDate, data, onDayClick, onMonthClick, className }: YearViewProps) {
  const year = parseInt(anchorDate.split('-')[0], 10);

  // Create a map of date -> day data for quick lookup
  const dayDataMap = useMemo(() => {
    const map = new Map<string, CalendarDayData>();
    data.days.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [data.days]);

  // Generate months data
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const monthStr = String(month).padStart(2, '0');
      const firstDay = `${year}-${monthStr}-01`;

      // Get all days in this month
      const daysInMonth = getDaysInMonth(year, month);
      const firstDayOfWeek = getFirstDayOfMonth(year, month);

      // Build mini grid (just current month days, no padding needed for mini view)
      const days: { date: string; dayOfMonth: number }[] = [];

      // Add padding days (empty) for alignment
      for (let i = 0; i < firstDayOfWeek; i++) {
        days.push({ date: '', dayOfMonth: 0 });
      }

      // Add actual days
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
        days.push({ date, dayOfMonth: d });
      }

      // Calculate month total
      let monthTotal = 0;
      let monthCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
        const dayData = dayDataMap.get(date);
        if (dayData) {
          monthTotal += dayData.totalAmount;
          monthCount += dayData.entryCount;
        }
      }

      return {
        month,
        name: getMonthName(month),
        days,
        total: monthTotal,
        count: monthCount,
      };
    });
  }, [year, dayDataMap]);

  // Weekday labels (short)
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className={cn('grid grid-cols-3 md:grid-cols-4 gap-4', className)}>
      {months.map(({ month, name, days, total, count }) => (
        <button
          key={month}
          onClick={() => onMonthClick(month)}
          className={cn(
            'flex flex-col p-3 rounded-lg border transition-all duration-200',
            'hover:shadow-sm hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary',
            'text-left'
          )}
        >
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{name}</span>
            {total > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCellAmount(total)}
              </span>
            )}
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdayLabels.map((d) => (
              <div
                key={d}
                className="text-[8px] text-center text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Mini calendar grid */}
          <div className="grid grid-cols-7 gap-0.5 flex-1">
            {days.map(({ date, dayOfMonth }, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="h-3 w-3" />;
              }

              const dayData = dayDataMap.get(date);
              const amount = dayData?.totalAmount || 0;

              return (
                <MiniHeatmapCell
                  key={date}
                  date={date}
                  amount={amount}
                  stats={data.stats}
                  isCurrentMonth={true}
                  onClick={(_, e) => {
                    e.stopPropagation();
                    onDayClick(date);
                  }}
                />
              );
            })}
          </div>

          {/* Month footer */}
          {count > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {count}笔
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// Helper function for formatting
function formatCellAmount(amount: number): string {
  if (amount >= 10000) {
    return `${Math.round(amount / 1000)}k`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}k`;
  }
  return Math.round(amount).toString();
}
