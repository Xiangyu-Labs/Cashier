import type { CalendarDayData } from "../types";
import { formatDate, parseDate } from "./date-utils";

export interface HeatmapQueryRange {
  startDate: string;
  endDate: string;
}

export const MAX_HEATMAP_DAYS = 3660;
const dateKeyCache = new Map<string, string[]>();
const DATE_KEY_CACHE_LIMIT = 32;

export function resolveHeatmapRange(
  days: readonly CalendarDayData[],
  queryRange?: HeatmapQueryRange
): HeatmapQueryRange | null {
  if (queryRange != null) return queryRange;
  if (days.length === 0) return null;
  let startDate = days[0]!.date;
  let endDate = startDate;
  for (const day of days) {
    if (day.date < startDate) startDate = day.date;
    if (day.date > endDate) endDate = day.date;
  }
  return { startDate, endDate };
}

export function generateHeatmapDateKeys(range: HeatmapQueryRange | null): string[] {
  if (range == null) return [];
  const cacheKey = `${range.startDate}:${range.endDate}`;
  const cached = dateKeyCache.get(cacheKey);
  if (cached != null) return cached;
  const current = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime()) || current > end) return [];
  const result: string[] = [];
  while (current <= end) {
    if (result.length >= MAX_HEATMAP_DAYS) return [];
    result.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  if (dateKeyCache.size >= DATE_KEY_CACHE_LIMIT) {
    const oldestKey = dateKeyCache.keys().next().value;
    if (oldestKey != null) dateKeyCache.delete(oldestKey);
  }
  dateKeyCache.set(cacheKey, result);
  return result;
}
