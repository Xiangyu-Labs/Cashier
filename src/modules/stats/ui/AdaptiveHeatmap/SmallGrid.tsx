/**
 * Small Grid Heatmap (> 35 days)
 * GitHub-style 12px cells with horizontal scroll
 */

"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getHeatmapLevel } from "../../lib/heatmap-colors";
import { formatDate, parseDate } from "../../lib/date-utils";
import type { CalendarDayData, CalendarHeatmapStats } from "../../types";
import { DayCellSmall } from "./DayCellSmall";

interface SmallGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  queryRange?: { startDate: string; endDate: string };
  currency?: string;
  locale?: string;
}

export function SmallGridHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
  currency = "CNY",
  locale = "zh-CN",
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
    const firstDay = sortedDays[0];
    const lastDay = sortedDays[sortedDays.length - 1];
    if (firstDay == null || lastDay == null) {
      return [];
    }

    // Start from query range if provided, otherwise from earliest data
    const startDate = queryRange?.startDate ?? firstDay.date;

    // End is the later of: today or latest data date (capped by query end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestDataDate = parseDate(lastDay.date);
    const effectiveEndDate = latestDataDate > today ? latestDataDate : today;

    // Cap by query end if provided
    const queryEnd = queryRange?.endDate != null ? parseDate(queryRange.endDate) : null;
    const endDate = queryEnd != null && effectiveEndDate > queryEnd ? queryEnd : effectiveEndDate;

    // Find the Monday of the week containing startDate
    const start = parseDate(startDate);
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
        const dayData = dayMap.get(dateStr);
        weekDays.push(dayData != null ? { date: dateStr, dayData } : { date: dateStr });
        current.setDate(current.getDate() + 1);
      }

      result.push({ weekIndex, days: weekDays });
      weekIndex++;
    }

    return result;
  }, [days, dayMap, queryRange]);

  return (
    <div className={cn("w-full overflow-x-auto pb-2", className)}>
      {/* Inner container with overflow-visible to allow tooltip to show outside */}
      <div className="flex gap-[2px] min-h-[100px]">
        {weeks.map((week) => (
          <div key={week.weekIndex} className="flex flex-col gap-[2px] flex-shrink-0">
            {week.days.map(({ date, dayData }) => {
              const amount = dayData?.totalAmount ?? 0;
              const count = dayData?.entryCount ?? 0;
              const level = getHeatmapLevel(amount, stats);

              return (
                <DayCellSmall
                  key={date}
                  date={date}
                  amount={amount}
                  count={count}
                  level={level}
                  currency={currency}
                  locale={locale}
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
