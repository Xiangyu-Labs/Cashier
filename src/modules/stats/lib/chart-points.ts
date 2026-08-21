import type { DateRangeType } from "@/lib/date-utils";
import { parseDateString } from "@/lib/date-utils";

export interface ChartPoint {
  label: string;
  value: number;
  /** YYYY-MM-DD for daily granularity, YYYY-MM for yearly granularity. */
  fullDate: string;
}

export interface BuildChartPointsInput {
  data: { date: string; total: number }[];
  rangeType: DateRangeType;
  /** Inclusive civil start date (YYYY-MM-DD). */
  startDate: string;
  /** Inclusive civil end date (YYYY-MM-DD), already truncated by the ledger timezone. */
  endDate: string;
  locale?: string;
}

export const MAX_CHART_POINTS = 120;

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCivilDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (year == null || month == null || day == null) return dateStr;
  // UTC arithmetic keeps day iteration deterministic in any runtime timezone.
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function isValidDateString(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Builds the rendered chart points strictly from the queried range.
 *
 * The caller (stats state) already truncates the current period to today in the
 * ledger timezone; this function never reads the browser clock, so historical
 * periods render their full range and cross-timezone ledgers cannot lose days.
 */
export function buildChartPoints({
  data,
  rangeType,
  startDate,
  endDate,
  locale = "en",
}: BuildChartPointsInput): ChartPoint[] {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    return [];
  }

  // First occurrence wins, mirroring the previous find() semantics.
  const totalsByDate = new Map<string, number>();
  for (const point of data) {
    if (!totalsByDate.has(point.date)) {
      totalsByDate.set(point.date, point.total);
    }
  }

  if (rangeType === "year") {
    const startYear = Number(startDate.slice(0, 4));
    const startMonth = Number(startDate.slice(5, 7));
    const endYear = Number(endDate.slice(0, 4));
    const endMonth = Number(endDate.slice(5, 7));
    const monthCount = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    if (monthCount <= 0 || monthCount > MAX_CHART_POINTS) return [];

    const points: ChartPoint[] = [];
    for (let index = 0; index < monthCount; index++) {
      const month = startMonth + index;
      const year = startYear + Math.floor((month - 1) / 12);
      const monthOfYear = ((month - 1) % 12) + 1;
      const monthPrefix = `${year}-${String(monthOfYear).padStart(2, "0")}`;
      let total = 0;
      for (const point of data) {
        if (point.date.startsWith(monthPrefix)) {
          total += point.total;
        }
      }
      const monthLabel = parseDateString(`${monthPrefix}-01`).toLocaleString(locale, {
        month: "short",
      });
      points.push({ label: monthLabel, value: total, fullDate: monthPrefix });
    }
    return points;
  }

  const points: ChartPoint[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    if (points.length >= MAX_CHART_POINTS) return [];
    const total = totalsByDate.get(cursor) ?? 0;
    const label =
      rangeType === "week"
        ? parseDateString(cursor).toLocaleString(locale, { weekday: "short" })
        : String(Number(cursor.slice(8, 10)));
    points.push({ label, value: total, fullDate: cursor });
    cursor = addCivilDays(cursor, 1);
  }
  return points;
}
