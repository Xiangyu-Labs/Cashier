/**
 * Large Grid Heatmap (<= 35 days)
 * 7-column grid with 40px cells showing date and amount
 */

"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getHeatmapLevel } from "../../lib/heatmap-colors";
import { formatDate } from "../../lib/date-utils";
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

    // Start from query range if provided, otherwise from earliest data
    const startDate = queryRange?.startDate || sortedDays[0].date;

    // End is the later of: today or latest data date (capped by query end)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestDataDate = new Date(sortedDays[sortedDays.length - 1].date);
    const effectiveEndDate = latestDataDate > today ? latestDataDate : today;

    // Cap by query end if provided
    const queryEnd = queryRange?.endDate ? new Date(queryRange.endDate) : null;
    const endDate = queryEnd && effectiveEndDate > queryEnd ? queryEnd : effectiveEndDate;

    const result: { date: string; dayData?: CalendarDayData }[] = [];
    const current = new Date(startDate);
    const end = endDate;

    while (current <= end) {
      const dateStr = formatDate(current);
      result.push({
        date: dateStr,
        dayData: dayMap.get(dateStr),
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [days, dayMap, queryRange]);

  return (
    <div className={cn("w-full flex justify-center", className)}>
      {/* 7-column grid for days of week layout */}
      <div className="grid grid-cols-7 gap-2 w-full lg:max-w-[800px] xl:max-w-[900px] lg:gap-3 xl:gap-4">
        {gridDays.map(({ date, dayData }) => {
          const amount = dayData?.totalAmount || 0;
          const level = getHeatmapLevel(amount, stats);
          const dayNumber = parseInt(date.split("-")[2], 10);

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
