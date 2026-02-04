"use client";

import * as React from "react";

import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useTranslations, useFormatter } from "next-intl";

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
}

export function DateFilter({
    value,
    onChange,
    className,
    placeholder,
    size = "default"
}: DateFilterProps) {
    const t = useTranslations("DateFilter");
    const format = useFormatter();
    const [open, setOpen] = React.useState(false);

    // Parse value to Date
    const dateValue = React.useMemo(() => {
        if (!value) return null;
        if (value instanceof Date) return value;
        // Handle ISO string or date string
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }, [value]);

    // Internal state for manual input
    const [tempValue, setTempValue] = React.useState<string>(
        dateValue ? formatDateInput(dateValue) : ""
    );

    React.useEffect(() => {
        setTempValue(dateValue ? formatDateInput(dateValue) : "");
    }, [dateValue, open]);

    const handleApply = () => {
        if (tempValue) {
            const parsed = new Date(tempValue);
            if (!isNaN(parsed.getTime())) {
                onChange(parsed);
            }
        } else {
            onChange(null);
        }
        setOpen(false);
    };

    const handleClear = () => {
        setTempValue("");
        onChange(null);
        setOpen(false);
    };

    const handleToday = () => {
        const today = new Date();
        setTempValue(formatDateInput(today));
        onChange(today);
        setOpen(false);
    };

    const isSmall = size === "sm";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
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
                    <span className="truncate">
                        {dateValue
                            ? format.dateTime(dateValue, { year: 'numeric', month: 'short', day: 'numeric' })
                            : (placeholder || t("selectDate"))
                        }
                    </span>
                    <ChevronDown className={cn("ml-auto opacity-50 shrink-0", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")} />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                <div className="p-3 space-y-3">
                    {/* Quick actions */}
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={handleToday}
                        >
                            {t("today")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 text-xs text-muted-foreground"
                            onClick={handleClear}
                        >
                            {t("clear")}
                        </Button>
                    </div>

                    {/* Date input */}
                    <div className="space-y-2">
                        <Input
                            type="date"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="w-full"
                        />
                    </div>

                    {/* Apply button */}
                    <div className="flex justify-end">
                        <Button size="sm" onClick={handleApply}>
                            {t("apply")}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function formatDateInput(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
