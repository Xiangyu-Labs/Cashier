"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  format,
  isToday,
} from "date-fns";
import { useTranslations } from "next-intl";

interface CalendarProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  /** Whether to show shortcut options */
  showShortcuts?: boolean;
  /** 最小可选日期 */
  minDate?: Date;
  /** 最大可选日期 */
  maxDate?: Date;
  className?: string;
}

export function Calendar({
  value,
  onChange,
  showShortcuts = true,
  minDate,
  maxDate,
  className,
}: CalendarProps) {
  const t = useTranslations("Calendar");
  const [viewDate, setViewDate] = React.useState(value || new Date());

  // Sync view date when value changes from outside
  React.useEffect(() => {
    if (value) {
      setViewDate(value);
    }
  }, [value]);

  // Generate calendar grid
  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [viewDate]);

  const handlePrevMonth = () => {
    setViewDate((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => addMonths(prev, 1));
  };

  const handleDateSelect = (date: Date) => {
    // Check if date is within allowed range
    if (minDate && date < startOfDay(minDate)) return;
    if (maxDate && date > endOfDay(maxDate)) return;

    onChange(date);
  };

  const handleToday = () => {
    const today = new Date();
    onChange(today);
  };

  const handleYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    onChange(yesterday);
  };

  const handleClear = () => {
    onChange(null);
  };

  // Week day headers (starting from Sunday)
  const weekDays = t.raw("weekDays") as string[];

  const isDateDisabled = (date: Date) => {
    if (minDate && date < startOfDay(minDate)) return true;
    if (maxDate && date > endOfDay(maxDate)) return true;
    return false;
  };

  return (
    <div className={cn("w-[280px] p-3", className)}>
      {/* Shortcuts */}
      {showShortcuts && (
        <div className="grid grid-cols-3 gap-1 mb-3">
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleToday}>
            {t("today")}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleYesterday}>
            {t("yesterday")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-muted-foreground"
            onClick={handleClear}
          >
            {t("clear")}
          </Button>
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-semibold text-sm">
          {t("dateFormat", {
            year: format(viewDate, "yyyy"),
            month: format(viewDate, "M"),
          })}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((day) => (
          <div
            key={day}
            className="h-8 flex items-center justify-center text-xs text-muted-foreground font-medium"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((date) => {
          const isCurrentMonth = isSameMonth(date, viewDate);
          const isSelected = value && isSameDay(date, value);
          const isTodayDate = isToday(date);
          const disabled = isDateDisabled(date);

          return (
            <button
              key={date.toISOString()}
              onClick={() => handleDateSelect(date)}
              disabled={disabled}
              className={cn(
                "h-8 w-8 rounded-md text-sm flex items-center justify-center",
                "transition-colors relative",
                "hover:bg-accent",
                !isCurrentMonth && "text-muted-foreground/40",
                isCurrentMonth && "text-foreground",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                isTodayDate &&
                  !isSelected &&
                  "ring-1 ring-primary ring-inset text-primary font-medium",
                disabled && "opacity-30 cursor-not-allowed hover:bg-transparent"
              )}
            >
              {format(date, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Helper functions
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}
