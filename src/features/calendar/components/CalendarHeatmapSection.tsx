/**
 * Calendar Heatmap Section
 *
 * Simplified heatmap component for StatsTab.
 * Shows monthly heatmap with navigation.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCalendarHeatmap } from '../client/hooks/useCalendarData';
import { MonthView } from './MonthView';
import { getHeatmapLegend } from '../lib/heatmap-colors';
import {
  formatDate,
  getPreviousMonth,
  getNextMonth,
} from '../lib/date-utils';
import type { Ledger } from '@/types/api';

interface CalendarHeatmapSectionProps {
  ledgerId?: string;
  ledger?: Ledger;
  onDateDrilldown?: (date: string) => void;
  className?: string;
}

export function CalendarHeatmapSection({
  ledgerId,
  ledger,
  onDateDrilldown,
  className,
}: CalendarHeatmapSectionProps) {
  const [anchorDate, setAnchorDate] = useState<string>(formatDate(new Date()));

  // Fetch calendar data
  const { data: calendarData, isLoading } = useCalendarHeatmap(
    ledgerId || '',
    'month',
    anchorDate
  );

  // Navigation handlers
  const handlePrevMonth = useCallback(() => {
    setAnchorDate((current) => getPreviousMonth(current));
  }, []);

  const handleNextMonth = useCallback(() => {
    setAnchorDate((current) => getNextMonth(current));
  }, []);

  const handleToday = useCallback(() => {
    setAnchorDate(formatDate(new Date()));
  }, []);

  // Handle day click
  const handleDayClick = useCallback(
    (date: string) => {
      if (onDateDrilldown) {
        onDateDrilldown(date);
      }
    },
    [onDateDrilldown]
  );

  // Format month label
  const monthLabel = useMemo(() => {
    const [year, month] = anchorDate.split('-').map(Number);
    return `${year}年${month}月`;
  }, [anchorDate]);

  // Check if current month is today
  const isCurrentMonth = useMemo(() => {
    const today = formatDate(new Date());
    return anchorDate.slice(0, 7) === today.slice(0, 7);
  }, [anchorDate]);

  // Legend items
  const legend = useMemo(() => getHeatmapLegend(), []);

  if (!ledgerId) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[80px] text-center">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToday}
            className="h-8 text-xs"
          >
            今天
          </Button>
        )}
      </div>

      {/* Calendar grid */}
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
          anchorDate={anchorDate}
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
