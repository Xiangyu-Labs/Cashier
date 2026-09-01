"use client";
import * as React from "react";
import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import {
  formatCivilDate,
  formatDateTimeForApi,
  isValidDateString,
  parseDateString,
} from "@/lib/date-utils";

interface DateFilterProps {
  /** Selected date */
  value?: Date | string | null;
  /** Callback when date changes */
  onChange: (date: Date | null) => void;
  className?: string;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Size variant */
  size?: "sm" | "default";
  /** Show clear button when date is selected */
  showClear?: boolean;
  /** Whether to truncate overflow text with ellipsis */
  truncate?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

export function DateFilter({
  value,
  onChange,
  className,
  placeholder,
  size = "default",
  showClear = true,
  truncate = true,
  disabled = false,
  minDate,
  maxDate,
}: DateFilterProps) {
  const t = useTranslations("DateFilter");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);

  const civilDateString = React.useMemo(() => {
    if (value == null) return null;
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : formatDateTimeForApi(value);
    }
    return isValidDateString(value) ? value : null;
  }, [value]);

  const dateValue = React.useMemo(
    () => (civilDateString == null ? null : parseDateString(civilDateString)),
    [civilDateString]
  );

  const handleDateChange = (date: Date | null) => {
    onChange(date);
    if (date !== undefined) {
      setOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  const isSmall = size === "sm";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative inline-flex", className)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            disabled={disabled}
            variant="outline"
            size={isSmall ? "sm" : "default"}
            className={cn(
              "w-full justify-start text-left font-normal",
              isSmall ? "h-8 px-2" : "h-10 px-3",
              showClear && dateValue && !disabled && (isSmall ? "pr-8" : "pr-10"),
              !dateValue && "text-muted-foreground"
            )}
          >
            <CalendarIcon className={cn("mr-2 shrink-0", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")} />
            <span className={cn(truncate ? "truncate" : "whitespace-nowrap", "flex-1")}>
              {civilDateString != null
                ? formatCivilDate(civilDateString, locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : (placeholder ?? t("selectDate"))}
            </span>
            <ChevronDown
              className={cn("ml-auto opacity-50 shrink-0", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")}
            />
          </Button>
        </PopoverTrigger>
        {showClear && dateValue && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("clear")}
            className={cn(
              "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-sm opacity-60 hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSmall ? "size-7" : "size-8"
            )}
          >
            <X className={isSmall ? "size-3" : "size-4"} />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar
          value={dateValue}
          onChange={handleDateChange}
          onEscape={() => setOpen(false)}
          showShortcuts
          {...(minDate === undefined ? {} : { minDate })}
          {...(maxDate === undefined ? {} : { maxDate })}
        />
      </PopoverContent>
    </Popover>
  );
}
