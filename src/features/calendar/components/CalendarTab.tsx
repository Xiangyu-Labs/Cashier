/**
 * Calendar Tab Component
 *
 * Main container for calendar heatmap visualization with month/week/year views.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CalendarHeader } from './CalendarHeader';
import { CalendarFilters } from './CalendarFilters';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { YearView } from './YearView';
import { DayDetailDialog } from './DayDetailDialog';
import { useCalendarHeatmap } from '../client/hooks/useCalendarData';
import { queryKeys } from '@/lib/query-keys';
import type { EntryCategory, Ledger } from '@/types/api';
import type { CalendarViewType, CalendarFilters as CalendarFiltersType } from '../types';
import {
  formatDate,
  getPreviousMonth,
  getNextMonth,
  getPreviousWeek,
  getNextWeek,
  getPreviousYear,
  getNextYear,
} from '../lib/date-utils';

interface CalendarTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  className?: string;
}

export function CalendarTab({ ledgerId, categories, ledger, className }: CalendarTabProps) {
  const queryClient = useQueryClient();
  const [viewType, setViewType] = useState<CalendarViewType>('month');
  const [anchorDate, setAnchorDate] = useState<string>(formatDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CalendarFiltersType>({});

  // Get preferred currencies from ledger settings
  const preferredCurrencies = useMemo(() => {
    return ledger?.metadata?.settings?.currencies || [];
  }, [ledger]);

  // Fetch calendar data
  const { data: calendarData, isLoading } = useCalendarHeatmap(
    ledgerId,
    viewType,
    anchorDate,
    filters
  );

  // Navigation handlers
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      setAnchorDate((current) => {
        switch (viewType) {
          case 'month':
            return direction === 'prev'
              ? getPreviousMonth(current)
              : getNextMonth(current);
          case 'week':
            return direction === 'prev'
              ? getPreviousWeek(current)
              : getNextWeek(current);
          case 'year':
            return direction === 'prev'
              ? getPreviousYear(current)
              : getNextYear(current);
        }
      });
    },
    [viewType]
  );

  // Handle day click
  const handleDayClick = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  // Handle month click (switch to month view)
  const handleMonthClick = useCallback((month: number) => {
    const year = anchorDate.split('-')[0];
    const newDate = `${year}-${String(month).padStart(2, '0')}-01`;
    setAnchorDate(newDate);
    setViewType('month');
  }, [anchorDate]);

  // Close day detail dialog
  const handleCloseDialog = useCallback(() => {
    setSelectedDate(null);
  }, []);

  // Handle view change
  const handleViewChange = useCallback((newView: CalendarViewType) => {
    setViewType(newView);
    // Adjust anchor date if needed
    setAnchorDate((current) => {
      const [year, month, day] = current.split('-').map(Number);
      switch (newView) {
        case 'month':
          // Keep year and month, set to first day
          return `${year}-${String(month).padStart(2, '0')}-01`;
        case 'week':
          // Keep current date, will be adjusted to week view
          return current;
        case 'year':
          // Keep year, set to Jan 1
          return `${year}-01-01`;
      }
    });
  }, []);

  // Prefetch adjacent periods for smoother navigation
  const prefetchAdjacent = useCallback(() => {
    if (!calendarData) return;

    const prefetch = (date: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.calendarHeatmap(ledgerId, viewType, date, filters),
        queryFn: async () => {
          const { getCalendarHeatmapData } = await import('../server/actions/heatmap');
          return getCalendarHeatmapData({ ledgerId, viewType, anchorDate: date, filters });
        },
      });
    };

    // Prefetch previous and next periods
    if (viewType === 'month') {
      prefetch(getPreviousMonth(anchorDate));
      prefetch(getNextMonth(anchorDate));
    } else if (viewType === 'week') {
      prefetch(getPreviousWeek(anchorDate));
      prefetch(getNextWeek(anchorDate));
    }
  }, [calendarData, queryClient, ledgerId, viewType, anchorDate, filters]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header */}
      <CalendarHeader
        viewType={viewType}
        onViewChange={handleViewChange}
        anchorDate={anchorDate}
        onNavigate={handleNavigate}
        onToggleFilters={() => setShowFilters(!showFilters)}
        showFilters={showFilters}
      />

      {/* Filters */}
      {showFilters && (
        <CalendarFilters
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories}
          preferredCurrencies={preferredCurrencies}
        />
      )}

      {/* Calendar Content */}
      <div className="flex-1">
        {isLoading ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            加载中…
          </div>
        ) : !calendarData ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <>
            {viewType === 'month' && (
              <MonthView
                anchorDate={anchorDate}
                data={calendarData}
                onDayClick={handleDayClick}
              />
            )}
            {viewType === 'week' && (
              <WeekView
                anchorDate={anchorDate}
                data={calendarData}
                onDayClick={handleDayClick}
              />
            )}
            {viewType === 'year' && (
              <YearView
                anchorDate={anchorDate}
                data={calendarData}
                onDayClick={handleDayClick}
                onMonthClick={handleMonthClick}
              />
            )}
          </>
        )}
      </div>

      {/* Day Detail Dialog */}
      <DayDetailDialog
        ledgerId={ledgerId}
        date={selectedDate}
        filters={filters}
        onClose={handleCloseDialog}
      />
    </div>
  );
}
