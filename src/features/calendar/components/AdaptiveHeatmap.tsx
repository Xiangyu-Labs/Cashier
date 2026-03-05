/**
 * Adaptive Heatmap Component
 *
 * Pure heatmap visualization that adapts to data range size:
 * - <= 35 days: Large grid (40px cells) with date and amount visible
 * - > 35 days: Small grid (12px cells) GitHub-style with horizontal scroll
 *
 * No calendar features - just spending intensity visualization.
 */

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getHeatmapLevel,
  getHeatmapColor,
  formatCellAmount,
} from '../lib/heatmap-colors';
import type { CalendarDayData, CalendarHeatmapStats } from '../types';

interface AdaptiveHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  /**
   * Query range for the heatmap display.
   * If not provided, falls back to data-driven range.
   */
  queryRange?: {
    startDate: string;
    endDate: string;
  };
}

export function AdaptiveHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
}: AdaptiveHeatmapProps) {
  const dayCount = days.length;

  // Use large grid for small ranges (<= 35 days), small grid for large ranges
  if (dayCount <= 35) {
    return (
      <LargeGridHeatmap
        days={days}
        stats={stats}
        onDayClick={onDayClick}
        className={className}
        queryRange={queryRange}
      />
    );
  }

  return (
    <SmallGridHeatmap
      days={days}
      stats={stats}
      onDayClick={onDayClick}
      className={className}
      queryRange={queryRange}
    />
  );
}

/**
 * Large Grid Heatmap (<= 35 days)
 * 7-column grid with 40px cells showing date and amount
 */
interface LargeGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
}

interface LargeGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  queryRange?: { startDate: string; endDate: string };
}

function LargeGridHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
}: LargeGridHeatmapProps) {
  // Create a map for quick lookup
  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDayData>();
    days.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [days]);

  // Generate continuous grid from query start to max(latest data, today)
  const gridDays = useMemo(() => {
    if (days.length === 0) return [];

    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

    // Start from query range if provided, otherwise from earliest data
    const startDate = queryRange?.startDate || sortedDays[0].date;

    // End is the later of: today or latest data date (capped by query end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestDataDate = new Date(sortedDays[sortedDays.length - 1].date);
    const effectiveEndDate = latestDataDate > today ? latestDataDate : today;

    // Cap by query end if provided
    const queryEnd = queryRange?.endDate ? new Date(queryRange.endDate) : null;
    const endDate = queryEnd && effectiveEndDate > queryEnd ? queryEnd : effectiveEndDate;

    const result: { date: string; dayData?: CalendarDayData }[] = [];
    const current = new Date(startDate);
    const end = endDate;

    while (current <= end) {
      const dateStr = formatDate(current);
      result.push({
        date: dateStr,
        dayData: dayMap.get(dateStr),
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [days, dayMap, queryRange]);

  return (
    <div className={cn('w-full', className)}>
      {/* 7-column grid for days of week layout */}
      <div className="grid grid-cols-7 gap-2">
        {gridDays.map(({ date, dayData }) => {
          const amount = dayData?.totalAmount || 0;
          const level = getHeatmapLevel(amount, stats);
          const dayNumber = parseInt(date.split('-')[2], 10);

          return (
            <DayCellLarge
              key={date}
              date={date}
              dayNumber={dayNumber}
              amount={amount}
              level={level}
              onClick={() => onDayClick?.(date)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Small Grid Heatmap (> 35 days)
 * GitHub-style 12px cells with 7 rows (Mon-Sun), horizontal scroll
 */
interface SmallGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  queryRange?: { startDate: string; endDate: string };
}

function SmallGridHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
}: SmallGridHeatmapProps) {
  // Create a map for quick lookup
  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDayData>();
    days.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [days]);

  // Generate weeks from query start to max(latest data, today)
  const weeks = useMemo(() => {
    if (days.length === 0) return [];

    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

    // Start from query range if provided, otherwise from earliest data
    const startDate = queryRange?.startDate || sortedDays[0].date;

    // End is the later of: today or latest data date (capped by query end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestDataDate = new Date(sortedDays[sortedDays.length - 1].date);
    const effectiveEndDate = latestDataDate > today ? latestDataDate : today;

    // Cap by query end if provided
    const queryEnd = queryRange?.endDate ? new Date(queryRange.endDate) : null;
    const endDate = queryEnd && effectiveEndDate > queryEnd ? queryEnd : effectiveEndDate;

    // Find the Monday of the week containing startDate
    const start = new Date(startDate);
    const startDayOfWeek = start.getDay(); // 0 = Sunday, 1 = Monday
    const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const firstMonday = new Date(start);
    firstMonday.setDate(start.getDate() - mondayOffset);

    const end = new Date(endDate);
    const endDayOfWeek = end.getDay();
    const sundayOffset = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
    const lastSunday = new Date(end);
    lastSunday.setDate(end.getDate() + sundayOffset);

    // Generate weeks
    const result: { weekIndex: number; days: { date: string; dayData?: CalendarDayData }[] }[] = [];
    let weekIndex = 0;
    const current = new Date(firstMonday);

    while (current <= lastSunday) {
      const weekDays: { date: string; dayData?: CalendarDayData }[] = [];

      for (let i = 0; i < 7; i++) {
        const dateStr = formatDate(current);
        weekDays.push({
          date: dateStr,
          dayData: dayMap.get(dateStr),
        });
        current.setDate(current.getDate() + 1);
      }

      result.push({ weekIndex, days: weekDays });
      weekIndex++;
    }

    return result;
  }, [days, dayMap, queryRange]);

  return (
    <div className={cn('w-full', className)}>
      {/* Horizontal scroll container */}
      <div className="flex gap-[2px] overflow-x-auto pb-2 min-h-[100px]">
        {weeks.map((week) => (
          <div key={week.weekIndex} className="flex flex-col gap-[2px] flex-shrink-0">
            {week.days.map(({ date, dayData }) => {
              const amount = dayData?.totalAmount || 0;
              const count = dayData?.entryCount || 0;
              const level = getHeatmapLevel(amount, stats);

              return (
                <DayCellSmall
                  key={date}
                  date={date}
                  amount={amount}
                  count={count}
                  level={level}
                  onClick={() => onDayClick?.(date)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Large Day Cell (40px)
 */
interface DayCellLargeProps {
  date: string;
  dayNumber: number;
  amount: number;
  level: number;
  onClick: () => void;
}

function DayCellLarge({ date, dayNumber, amount, level, onClick }: DayCellLargeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-full aspect-square rounded-lg transition-all duration-150',
          'flex flex-col items-center justify-center gap-0.5',
          'hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary'
        )}
        style={{
          backgroundColor: getHeatmapColor(level as 0 | 1 | 2 | 3 | 4 | 5),
          minHeight: '40px',
        }}
      >
        {/* Day number */}
        <span
          className={cn(
            'text-xs font-medium',
            level >= 4 ? 'text-white' : 'text-foreground'
          )}
        >
          {dayNumber}
        </span>

        {/* Amount */}
        {amount > 0 && (
          <span
            className={cn(
              'text-[10px] font-medium',
              level >= 4 ? 'text-white' : 'text-foreground'
            )}
          >
            {formatCellAmount(amount)}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <div>支出: {formatCellAmount(amount)}</div>
          ) : (
            <div className="text-muted-foreground">无消费</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Small Day Cell (12px)
 */
interface DayCellSmallProps {
  date: string;
  amount: number;
  count: number;
  level: number;
  onClick: () => void;
}

function DayCellSmall({ date, amount, count, level, onClick }: DayCellSmallProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-3 h-3 rounded-sm transition-all duration-150 flex-shrink-0',
          'hover:scale-125 hover:ring-1 hover:ring-primary/50 focus:outline-none focus:ring-1 focus:ring-primary'
        )}
        style={{
          backgroundColor: getHeatmapColor(level as 0 | 1 | 2 | 3 | 4 | 5),
        }}
      />

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <>
              <div>支出: {formatCellAmount(amount)}</div>
              <div>笔数: {count}笔</div>
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
