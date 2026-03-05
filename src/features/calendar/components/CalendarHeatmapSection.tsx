/**
 * Calendar Heatmap Section
 *
 * Simplified heatmap component for StatsTab.
 * Shows heatmap synchronized with StatsTab's selected time range.
 */

'use client';

import { useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useCalendarHeatmapForRange } from '../client/hooks/useCalendarData';
import { MonthView } from './MonthView';
import { getHeatmapLegend } from '../lib/heatmap-colors';
import type { Ledger } from '@/types/api';

interface CalendarHeatmapSectionProps {
  ledgerId?: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  onDateDrilldown?: (date: string) => void;
  className?: string;
}

export function CalendarHeatmapSection({
  ledgerId,
  startDate,
  endDate,
  onDateDrilldown,
  className,
}: CalendarHeatmapSectionProps) {
  // Fetch calendar data for the date range
  const { data: calendarData, isLoading } = useCalendarHeatmapForRange(
    ledgerId || '',
    startDate,
    endDate
  );

  // Handle day click
  const handleDayClick = useCallback(
    (date: string) => {
      if (onDateDrilldown) {
        onDateDrilldown(date);
      }
    },
    [onDateDrilldown]
  );

  // Format date range label
  const dateRangeLabel = useMemo(() => {
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    // Same month
    if (startYear === endYear && startMonth === endMonth) {
      return `${startYear}年${startMonth}月${startDay}日-${endDay}日`;
    }
    // Same year
    if (startYear === endYear) {
      return `${startYear}年${startMonth}月${startDay}日-${endMonth}月${endDay}日`;
    }
    // Different years
    return `${startYear}年${startMonth}月${startDay}日-${endYear}年${endMonth}月${endDay}日`;
  }, [startDate, endDate]);

  // Legend items
  const legend = useMemo(() => getHeatmapLegend(), []);

  if (!ledgerId) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Date range label */}
      <div className="flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">
          {dateRangeLabel}
        </span>
      </div>

      {/* Calendar grid - use startDate as anchor for MonthView */}
      {isLoading ? (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
          加载中…
        </div>
      ) : !calendarData ? (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
          暂无数据
        </div>
      ) : (
        <MonthView
          anchorDate={startDate}
          data={calendarData}
          onDayClick={handleDayClick}
        />
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground">少</span>
        <div className="flex gap-1">
          {legend.map((item) => (
            <div
              key={item.level}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: item.color }}
              title={item.label}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">多</span>
      </div>
    </div>
  );
}
