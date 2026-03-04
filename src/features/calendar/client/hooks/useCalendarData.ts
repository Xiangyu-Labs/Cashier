/**
 * Calendar Data Hook
 *
 * TanStack Query hooks for fetching calendar heatmap data.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getCalendarHeatmapData, getCalendarDayDetail } from '../../server/actions/heatmap';
import type {
    CalendarViewType,
    CalendarFilters,
    CalendarHeatmapData,
    CalendarDayDetailResponse,
} from '../../types';

const CALENDAR_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function useCalendarHeatmap(
    ledgerId: string,
    viewType: CalendarViewType,
    anchorDate: string,
    filters?: CalendarFilters
) {
    return useQuery<CalendarHeatmapData>({
        queryKey: queryKeys.calendarHeatmap(ledgerId, viewType, anchorDate, filters),
        queryFn: () => getCalendarHeatmapData({ ledgerId, viewType, anchorDate, filters }),
        staleTime: CALENDAR_STALE_TIME,
        placeholderData: (previousData) => previousData,
    });
}

export function useCalendarDayDetail(
    ledgerId: string,
    date: string | null,
    filters?: CalendarFilters
) {
    return useQuery<CalendarDayDetailResponse>({
        queryKey: queryKeys.calendarDayDetail(ledgerId, date || '', filters),
        queryFn: () => getCalendarDayDetail({ ledgerId, date: date!, filters }),
        staleTime: CALENDAR_STALE_TIME,
        enabled: !!date,
    });
}
