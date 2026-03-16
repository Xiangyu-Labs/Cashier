/**
 * Calendar Tab Component
 *
 * Main container for calendar heatmap visualization with month/year views.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CalendarHeader } from './CalendarHeader';
import { CalendarFilters } from './CalendarFilters';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { useCalendarHeatmap } from '../client/hooks/use-calendar-data';
import type { EntryCategory, Ledger } from '@/types/api';
import type { CalendarViewType, CalendarFilters as CalendarFiltersType } from '../types';
import {
  formatDate,
  getPreviousMonth,
  getNextMonth,
  getPreviousYear,
  getNextYear,
} from '../lib/date-utils';

interface CalendarTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  onDateDrilldown?: (date: string, filters?: { currency?: string | null; categoryId?: string | null }) => void;
  className?: string;
}

export function CalendarTab({ ledgerId, categories, ledger, onDateDrilldown, className }: CalendarTabProps) {
  const t = useTranslations('Calendar');
  const [viewType, setViewType] = useState<CalendarViewType>('month');
  const [anchorDate, setAnchorDate] = useState<string>(formatDate(new Date()));
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
          case 'year':
            return direction === 'prev'
              ? getPreviousYear(current)
              : getNextYear(current);
        }
      });
    },
    [viewType]
  );

  // Handle day click - navigate to details tab with date filter
  const handleDayClick = useCallback((date: string) => {
    if (onDateDrilldown) {
      // Pass current filters (currency/category) to preserve them in details view
      onDateDrilldown(date, {
        currency: filters.currency,
        categoryId: filters.categoryId,
      });
    }
  }, [onDateDrilldown, filters]);

  // Handle month click (switch to month view)
  const handleMonthClick = useCallback((month: number) => {
    const year = anchorDate.split('-')[0];
    const newDate = `${year}-${String(month).padStart(2, '0')}-01`;
    setAnchorDate(newDate);
    setViewType('month');
  }, [anchorDate]);

  // Handle view change
  const handleViewChange = useCallback((newView: CalendarViewType) => {
    setViewType(newView);
    // Adjust anchor date if needed
    setAnchorDate((current) => {
      const [year, month] = current.split('-').map(Number);
      switch (newView) {
        case 'month':
          // Keep year and month, set to first day
          return `${year}-${String(month).padStart(2, '0')}-01`;
        case 'year':
          // Keep year, set to Jan 1
          return `${year}-01-01`;
      }
    });
  }, []);

  // Prefetch logic removed - can be added back when needed for performance optimization

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
            {t('loading')}
          </div>
        ) : !calendarData ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            {t('noData')}
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
    </div>
  );
}
