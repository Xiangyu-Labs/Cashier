"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { parseDateString, formatDateTimeForApi } from "@/lib/date-utils";

interface EditableDateFieldProps {
    value: string; // yyyy-MM-dd format
    onChange: (value: string) => void;
    placeholder: string;
    displayFormat?: Intl.DateTimeFormatOptions;
    locale?: string;
    className?: string;
    disabled?: boolean;
}

export function EditableDateField({
    value,
    onChange,
    placeholder,
    displayFormat = { year: "numeric", month: "long", day: "numeric" },
    locale = "zh-CN",
    className,
    disabled = false,
}: EditableDateFieldProps) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);

    const formatDisplayDate = (dateStr: string) => {
        if (!dateStr) return placeholder;
        try {
            return parseDateString(dateStr).toLocaleDateString(locale, displayFormat);
        } catch {
            return dateStr;
        }
    };

    const handleDateChange = (date: Date | null) => {
        if (date) {
            const dateStr = formatDateTimeForApi(date);
            if (dateStr) {
                onChange(dateStr);
            }
        }
        setOpen(false);
    };

    // Parse value to Date for Calendar
    const dateValue = value ? parseDateString(value) : null;

    if (disabled) {
        return (
            <div
                className={cn(
                    "relative inline-flex items-center gap-1.5",
                    "rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                    "text-sm",
                    className
                )}
            >
                <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                <span>{formatDisplayDate(value)}</span>
            </div>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    ref={triggerRef}
                    className={cn(
                        "relative inline-flex items-center gap-1.5",
                        "rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                        "transition-all duration-150 ease-out",
                        "cursor-pointer hover:bg-surface2 border border-transparent hover:border-border/50",
                        className
                    )}
                >
                    <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                    <span className={cn("text-sm", !value && "text-muted-foreground/50")}>
                        {formatDisplayDate(value)}
                    </span>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                    value={dateValue}
                    onChange={handleDateChange}
                    showShortcuts={false}
                />
            </PopoverContent>
        </Popover>
    );
}
