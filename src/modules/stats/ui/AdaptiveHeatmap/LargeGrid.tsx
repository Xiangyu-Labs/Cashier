/**
 * Large Grid Heatmap (<= 35 days)
 * 7-column grid with 40px cells showing date and amount
 */

"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { parseDateString } from "@/lib/date-utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getHeatmapLevel } from "../../lib/heatmap-colors";
import { generateHeatmapDateKeys, resolveHeatmapRange } from "../../lib/heatmap-range";
import type { CalendarDayData, CalendarHeatmapStats } from "../../types";
import { DayCellLarge } from "./DayCellLarge";

interface LargeGridHeatmapProps {
  days: CalendarDayData[];
  stats: CalendarHeatmapStats;
  onDayClick?: (date: string) => void;
  className?: string;
  queryRange?: { startDate: string; endDate: string };
  currency: string;
  locale: string;
}

export function LargeGridHeatmap({
  days,
  stats,
  onDayClick,
  className,
  queryRange,
  currency,
  locale,
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
    return generateHeatmapDateKeys(resolveHeatmapRange(days, queryRange)).map((date) => {
      const dayData = dayMap.get(date);
      return dayData != null ? { date, dayData } : { date };
    });
  }, [days, dayMap, queryRange]);

  // Empty leading cells align the first day with the Monday-first week layout.
  const leadingEmptyCells = useMemo(() => {
    const range = resolveHeatmapRange(days, queryRange);
    if (range == null) return 0;
    const dayOfWeek = parseDateString(range.startDate).getDay(); // 0 = Sunday
    return (dayOfWeek + 6) % 7;
  }, [days, queryRange]);

  return (
    <div className={cn("w-full flex justify-center", className)}>
      {/* 7-column grid for days of week layout */}
      <TooltipProvider>
        <div className="grid min-w-0 w-full grid-cols-7 gap-1.5 sm:gap-2 lg:max-w-[800px] lg:gap-3 xl:max-w-[900px] xl:gap-4">
          {Array.from({ length: leadingEmptyCells }, (_, index) => (
            <div
              key={`offset-${index}`}
              aria-hidden="true"
              className="aspect-square w-full min-w-0"
            />
          ))}
          {gridDays.map(({ date, dayData }) => {
            const amount = dayData?.totalAmount ?? "0";
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
                currency={currency}
                locale={locale}
                onClick={() => onDayClick?.(date)}
              />
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
