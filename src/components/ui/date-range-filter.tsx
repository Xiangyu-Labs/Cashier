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
    const format = useFormatter();
    const [open, setOpen] = React.useState(false);

    // Internal state for manual inputs to allow typing before committing
    const [tempStart, setTempStart] = React.useState<string>(startDate ? formatDateInput(startDate) : "");
    const [tempEnd, setTempEnd] = React.useState<string>(endDate ? formatDateInput(endDate) : "");

    React.useEffect(() => {
        setTempStart(startDate ? formatDateInput(startDate) : "");
        setTempEnd(endDate ? formatDateInput(endDate) : "");
    }, [startDate, endDate, open]);

    const handlePreset = (days: number | "month" | "year" | "week") => {
        const end = new Date();
        const start = new Date();

        if (days === "week") {
            start.setDate(end.getDate() - 7);
        } else if (days === "month") {
            start.setMonth(end.getMonth() - 1);
        } else if (days === "year") {
            start.setFullYear(end.getFullYear() - 1);
        } else if (typeof days === "number") {
            // specific months count
            start.setMonth(end.getMonth() - days);
        }

        onRangeChange({ start, end });
        setOpen(false);
    };

    const handleThisMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        onRangeChange({ start, end });
        setOpen(false);
    }

    const handleManualApply = () => {
        const s = tempStart ? new Date(tempStart) : undefined;
        const e = tempEnd ? new Date(tempEnd) : undefined;
        if (e) e.setHours(23, 59, 59, 999);

        onRangeChange({ start: s, end: e });
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 justify-start text-left font-normal", !startDate && "text-muted-foreground", className)}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                        {startDate && endDate ? (
                            compact ? (
                                // Compact format: M/D - M/D (or M/D/Y if different years)
                                startDate.getFullYear() === endDate.getFullYear() ? (
                                    `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`
                                ) : (
                                    `${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()} - ${endDate.getMonth() + 1}/${endDate.getDate()}/${endDate.getFullYear()}`
                                )
                            ) : (
                                <>
                                    {format.dateTime(startDate, { year: 'numeric', month: 'short', day: 'numeric' })} - {format.dateTime(endDate, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </>
                            )
                        ) : (
                            t("selectRange")
                        )}
                    </span>
                    <ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0" align="start">
                <div className="flex flex-col sm:flex-row">
                    <div className="border-b sm:border-b-0 sm:border-r p-4 space-y-2 w-full sm:w-[140px]">
                        <div className="text-xs font-medium text-muted-foreground mb-2">{t("commonRanges")}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-1 gap-1">
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={handleThisMonth}>
                                {t("thisMonth")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("week")}>
                                {t("pastWeek")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("month")}>
                                {t("pastMonth")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset(3)}>
                                {t("past3Months")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset(6)}>
                                {t("past6Months")}
                            </Button>
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("year")}>
                                {t("pastYear")}
                            </Button>
                        </div>
                    </div>
                    <div className="p-4 space-y-4 w-full">
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{t("customRange")}</div>
                            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                                <Input
                                    type="date"
                                    value={tempStart}
                                    onChange={(e) => setTempStart(e.target.value)}
                                    className="w-full sm:w-[140px]"
                                />
                                <span className="hidden sm:inline text-muted-foreground">-</span>
                                <Input
                                    type="date"
                                    value={tempEnd}
                                    onChange={(e) => setTempEnd(e.target.value)}
                                    className="w-full sm:w-[140px]"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button size="sm" className="w-full sm:w-auto" onClick={handleManualApply}>{t("apply")}</Button>
                        </div>
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
