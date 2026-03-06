"use client";

import * as React from "react";

import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, isBefore, format } from "date-fns";

import { useTranslations, useFormatter } from "next-intl";

interface DateRangeFilterProps {
    startDate?: Date;
    endDate?: Date;
    onRangeChange: (range: { start?: Date; end?: Date }) => void;
    className?: string;
    /** Use compact date format (e.g., 2/1 - 2/28) */
    compact?: boolean;
}

export function DateRangeFilter({ startDate, endDate, onRangeChange, className, compact = false }: DateRangeFilterProps) {
    const t = useTranslations("DateRangeFilter");
    const formatter = useFormatter();
    const [open, setOpen] = React.useState(false);

    // Selection state for range picking
    const [selecting, setSelecting] = React.useState<"start" | "end">("start");
    const [tempStart, setTempStart] = React.useState<Date | null>(startDate || null);
    const [tempEnd, setTempEnd] = React.useState<Date | null>(endDate || null);

    // Reset temp state when opening
    React.useEffect(() => {
        if (open) {
            setTempStart(startDate || null);
            setTempEnd(endDate || null);
            setSelecting("start");
        }
    }, [open, startDate, endDate]);

    // Auto-detect very small screen for compact mode
    const [isSmallScreen, setIsSmallScreen] = React.useState(false);
    React.useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 400px)');
        setIsSmallScreen(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const useCompactMode = compact || isSmallScreen;

    const handlePreset = (type: "today" | "yesterday" | "week" | "month" | "year") => {
        const end = new Date();
        const start = new Date();

        switch (type) {
            case "today":
                // start and end are both today
                break;
            case "yesterday":
                start.setDate(end.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case "week":
                start.setDate(end.getDate() - 7);
                break;
            case "month":
                start.setMonth(end.getMonth() - 1);
                break;
            case "year":
                start.setFullYear(end.getFullYear() - 1);
                break;
        }

        onRangeChange({ start: startOfDay(start), end: endOfDay(end) });
        setOpen(false);
    };

    const handleThisMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        onRangeChange({ start, end });
        setOpen(false);
    };

    const handleStartDateChange = (date: Date | null) => {
        if (date) {
            const start = startOfDay(date);
            setTempStart(start);
            if (tempEnd && isBefore(tempEnd, start)) {
                // If end is before new start, reset end
                setTempEnd(null);
            }
            setSelecting("end");
        } else {
            setTempStart(null);
        }
    };

    const handleEndDateChange = (date: Date | null) => {
        if (date) {
            const end = endOfDay(date);
            if (tempStart && isBefore(end, tempStart)) {
                // If end is before start, swap them
                setTempEnd(startOfDay(tempStart));
                setTempStart(end);
            } else {
                setTempEnd(end);
            }
        } else {
            setTempEnd(null);
        }
    };

    const handleApply = () => {
        if (tempStart || tempEnd) {
            onRangeChange({
                start: tempStart || undefined,
                end: tempEnd || undefined,
            });
        }
        setOpen(false);
    };

    const handleClear = () => {
        onRangeChange({ start: undefined, end: undefined });
        setOpen(false);
    };

    const formatDisplayDate = (date: Date) => {
        if (useCompactMode) {
            return format(date, "M/d");
        }
        return formatter.dateTime(date, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 justify-start text-left font-normal", !startDate && !endDate && "text-muted-foreground", className)}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate flex-1">
                        {startDate && endDate ? (
                            useCompactMode ? (
                                startDate.getFullYear() === endDate.getFullYear() ? (
                                    `${format(startDate, "M/d")} - ${format(endDate, "M/d")}`
                                ) : (
                                    `${format(startDate, "M/d/yy")} - ${format(endDate, "M/d/yy")}`
                                )
                            ) : (
                                <>
                                    {formatDisplayDate(startDate)} - {formatDisplayDate(endDate)}
                                </>
                            )
                        ) : startDate ? (
                            `${formatDisplayDate(startDate)} - ...`
                        ) : endDate ? (
                            `... - ${formatDisplayDate(endDate)}`
                        ) : (
                            t("selectRange")
                        )}
                    </span>
                    {(startDate || endDate) ? (
                        <X
                            className="ml-2 h-4 w-4 opacity-50 hover:opacity-100 shrink-0 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClear();
                            }}
                        />
                    ) : (
                        <ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="flex flex-col sm:flex-row">
                    {/* Left Panel: Shortcuts */}
                    <div className="border-b sm:border-b-0 sm:border-r p-3 w-full sm:w-[130px] space-y-2">
                        <div className="text-xs font-medium text-muted-foreground mb-2">{t("commonRanges")}</div>
                        <div className="grid grid-cols-3 sm:grid-cols-1 gap-1">
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={() => handlePreset("today")}>
                                {t("today")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={() => handlePreset("yesterday")}>
                                {t("yesterday")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={handleThisMonth}>
                                {t("thisMonth")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={() => handlePreset("week")}>
                                {t("pastWeek")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={() => handlePreset("month")}>
                                {t("pastMonth")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7 px-2" onClick={() => handlePreset("year")}>
                                {t("pastYear")}
                            </Button>
                        </div>
                    </div>

                    {/* Right Panel: Two Calendars */}
                    <div className="p-3">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Start Date Calendar */}
                            <div className={cn("relative", selecting === "start" ? "opacity-100" : "opacity-70")}>
                                <div className="text-xs font-medium text-muted-foreground mb-2 text-center">
                                    {t("startDate")}
                                </div>
                                <Calendar
                                    value={tempStart}
                                    onChange={handleStartDateChange}
                                    showShortcuts={false}
                                    maxDate={tempEnd || undefined}
                                />
                            </div>

                            {/* End Date Calendar */}
                            <div className={cn("relative", selecting === "end" ? "opacity-100" : "opacity-70")}>
                                <div className="text-xs font-medium text-muted-foreground mb-2 text-center">
                                    {t("endDate")}
                                </div>
                                <Calendar
                                    value={tempEnd}
                                    onChange={handleEndDateChange}
                                    showShortcuts={false}
                                    minDate={tempStart || undefined}
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-between items-center mt-3 pt-3 border-t">
                            <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground">
                                {t("clear")}
                            </Button>
                            <Button size="sm" onClick={handleApply} className="text-xs">
                                {t("apply")}
                            </Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
