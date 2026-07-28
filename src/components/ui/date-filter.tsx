"use client";
import * as React from "react";
import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useTranslations, useFormatter } from "next-intl";
import { parseDateString } from "@/lib/date-utils";

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
}: DateFilterProps) {
  const t = useTranslations("DateFilter");
  const format = useFormatter();
  const [open, setOpen] = React.useState(false);

  // Parse value to Date
  const dateValue = React.useMemo(() => {
    if (value == null) return null;
    if (value instanceof Date) return value;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateString(value) : new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, [value]);

  const handleDateChange = (date: Date | null) => {
    onChange(date);
    if (date !== undefined) {
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const isSmall = size === "sm";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={disabled}
          variant="outline"
          size={isSmall ? "sm" : "default"}
          className={cn(
            "justify-start text-left font-normal",
            isSmall ? "h-8 px-2" : "h-10 px-3",
            !dateValue && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className={cn("mr-2 shrink-0", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className={cn(truncate ? "truncate" : "whitespace-nowrap", "flex-1")}>
            {dateValue != null
              ? format.dateTime(dateValue, { year: "numeric", month: "short", day: "numeric" })
              : (placeholder ?? t("selectDate"))}
          </span>
          {showClear && dateValue ? (
            <X
              className={cn(
                "ml-2 opacity-50 hover:opacity-100 shrink-0 cursor-pointer",
                isSmall ? "h-3 w-3" : "h-4 w-4"
              )}
              onClick={handleClear}
            />
          ) : (
            <ChevronDown
              className={cn("ml-auto opacity-50 shrink-0", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar value={dateValue} onChange={handleDateChange} showShortcuts={true} />
      </PopoverContent>
    </Popover>
  );
}
