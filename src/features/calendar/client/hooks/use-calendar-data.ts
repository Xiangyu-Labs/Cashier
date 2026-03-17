/**
 * Calendar Data Hook
 *
 * TanStack Query hooks for fetching calendar heatmap data.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { CALENDAR } from "@/lib/constants";
import {
  getCalendarHeatmapData,
  getCalendarDayDetail,
  getCalendarHeatmapForRange,
} from "../../server/actions/heatmap";
import type {
  CalendarViewType,
  CalendarFilters,
  CalendarHeatmapData,
  CalendarDayDetailResponse,
} from "../../types";

const CALENDAR_STALE_TIME = CALENDAR.STALE_TIME_MS;

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
    queryKey: queryKeys.calendarDayDetail(ledgerId, date ?? "", filters),
    queryFn: () => getCalendarDayDetail({ ledgerId, date: date!, filters }),
    staleTime: CALENDAR_STALE_TIME,
    enabled: date != null && date !== "",
  });
}

/**
 * Hook for fetching calendar heatmap data for a custom date range
 * Used by StatsTab to show heatmap synchronized with selected time range
 */
export function useCalendarHeatmapForRange(
  ledgerId: string,
  startDate: string,
  endDate: string,
  filters?: CalendarFilters
) {
  return useQuery<CalendarHeatmapData>({
    queryKey: queryKeys.calendarHeatmapForRange(ledgerId, startDate, endDate, filters),
    queryFn: () => getCalendarHeatmapForRange({ ledgerId, startDate, endDate, filters }),
    staleTime: CALENDAR_STALE_TIME,
    placeholderData: (previousData) => previousData,
  });
}
