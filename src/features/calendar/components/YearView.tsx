/**
 * Year View Component
 *
 * GitHub-style contributions heatmap showing full year of spending data.
 * 53 weeks x 7 days continuous grid layout.
 */

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getHeatmapLevel,
  getHeatmapColor,
  getHeatmapLabel,
} from '../lib/heatmap-colors';
import type { CalendarHeatmapData, CalendarDayData } from '../types';

interface YearViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  onMonthClick: (month: number) => void;
  className?: string;
}

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

export function YearView({ anchorDate, data, onDayClick, className }: YearViewProps) {
  const year = parseInt(anchorDate.split('-')[0], 10);

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
  const monthLabels = useMemo(() => {
    const labels: { month: number; weekIndex: number; label: string }[] = [];
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
  const stats = useMemo(() => {
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

  // Weekday labels (Monday to Sunday)
  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Month labels */}
      <div className="flex mb-1 ml-6">
        {monthLabels.map(({ month, weekIndex, label }, index) => {
          // Calculate position based on week index
          const leftOffset = weekIndex * 12;
          return (
            <div
              key={month}
              className="text-xs text-muted-foreground whitespace-nowrap absolute"
              style={{
                marginLeft: `${leftOffset}px`,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div className="flex mt-5">
        {/* Weekday labels */}
        <div className="flex flex-col mr-2 gap-[2px]">
          {weekdayLabels.map((day, index) => (
            <div
              key={day}
              className={cn(
                'text-[10px] text-muted-foreground w-4 flex items-center justify-center',
                index % 2 === 1 && 'invisible' // Show every other label to save space
              )}
              style={{ height: '10px' }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex gap-[2px] overflow-x-auto pb-2">
          {weeks.map((week) => (
            <div key={week.weekIndex} className="flex flex-col gap-[2px]">
              {week.days.map((day) => (
                <DayCell
                  key={day.date}
                  day={day}
                  onClick={() => onDayClick(day.date)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-4">
        {/* Legend */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-[2px]">
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getHeatmapColor(level as 0 | 1 | 2 | 3 | 4 | 5) }}
                title={getHeatmapLabel(level as 0 | 1 | 2 | 3 | 4 | 5)}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>总支出:</span>
            <span className="font-medium text-foreground">
              {formatAmount(stats.totalAmount)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>总笔数:</span>
            <span className="font-medium text-foreground">{stats.totalCount}笔</span>
          </div>
          <div className="flex items-center gap-1">
            <span>日均:</span>
            <span className="font-medium text-foreground">
              {formatAmount(stats.avgDaily)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DayCellProps {
  day: DayCellData;
  onClick: () => void;
}

function DayCell({ day, onClick }: DayCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  const tooltipText = day.amount > 0
    ? `${day.date}\n支出: ${formatAmount(day.amount)}\n笔数: ${day.count}笔`
    : `${day.date}\n无消费`;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-[10px] h-[10px] rounded-sm transition-all duration-150',
          'hover:scale-125 hover:ring-1 hover:ring-primary/50 focus:outline-none focus:ring-1 focus:ring-primary',
          !day.isInYear && 'opacity-30'
        )}
        style={{
          backgroundColor: getHeatmapColor(day.level as 0 | 1 | 2 | 3 | 4 | 5),
        }}
        title={tooltipText}
      />
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{day.date}</div>
          {day.amount > 0 ? (
            <>
              <div>支出: {formatAmount(day.amount)}</div>
              <div>笔数: {day.count}笔</div>
            </>
          ) : (
            <div className="text-muted-foreground">无消费</div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format date as yyyy-MM-dd
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper function to format amount
function formatAmount(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(1)}万`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}k`;
  }
  return amount.toFixed(2);
}
