/**
 * Large Grid Heatmap (<= 35 days)
 * 7-column grid with 40px cells showing date and amount
 */

"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getHeatmapLevel } from "../../lib/heatmap-colors";
import { formatDate, parseDate } from "../../lib/date-utils";
import type { CalendarDayData, CalendarHeatmapStats } from "../../types";
import { DayCellLarge } from "./DayCellLarge";

interface LargeGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  queryRange?: { startDate: string; endDate: string };
}

export function LargeGridHeatmap({
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

    const result: { date: string; dayData?: CalendarDayData }[] = [];
    const current = parseDate(startDate);
    const end = endDate;

    while (current <= end) {
      const dateStr = formatDate(current);
      const dayData = dayMap.get(dateStr);
      result.push(dayData != null ? { date: dateStr, dayData } : { date: dateStr });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [days, dayMap, queryRange]);

  return (
    <div className={cn("w-full flex justify-center", className)}>
      {/* 7-column grid for days of week layout */}
      <div className="grid grid-cols-7 gap-2 w-full lg:max-w-[800px] xl:max-w-[900px] lg:gap-3 xl:gap-4">
        {gridDays.map(({ date, dayData }) => {
          const amount = dayData?.totalAmount ?? 0;
          const level = getHeatmapLevel(amount, stats);
          const [, , dayPart] = date.split("-");
          const dayNumber = Number.parseInt(dayPart ?? "1", 10);

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
