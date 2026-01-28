"use client";

import * as React from "react";
// import { format } from "date-fns"; // We don't have date-fns, will use native
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
    startDate?: Date;
    endDate?: Date;
    onRangeChange: (range: { start?: Date; end?: Date }) => void;
    className?: string;
}

export function DateRangeFilter({ startDate, endDate, onRangeChange, className }: DateRangeFilterProps) {
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

        // Adjust for "Current Month" specific logic if needed? 
        // User asked for "Past 1 week, 1 month...". 
        // But also said "Default show current month interval".
        // Let's add "This Month" as a preset too.

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
        // set time to end of day for end date if it's manual entry? 
        // Usually date input gives 00:00. 
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
                    className={cn("h-8 justify-start text-left font-normal w-[240px]", !startDate && "text-muted-foreground", className)}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate && endDate ? (
                        <>
                            {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
                        </>
                    ) : (
                        <span>选择日期范围</span>
                    )}
                    <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="flex">
                    <div className="border-r p-4 space-y-2 w-[140px]">
                        <div className="text-xs font-medium text-muted-foreground mb-2">常用区间</div>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={handleThisMonth}>
                            本月
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("week")}>
                            过去7天
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("month")}>
                            过去1个月
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset(3)}>
                            过去3个月
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset(6)}>
                            过去半年
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handlePreset("year")}>
                            过去1年
                        </Button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">自定义区间</div>
                            <div className="flex gap-2 items-center">
                                <Input
                                    type="date"
                                    value={tempStart}
                                    onChange={(e) => setTempStart(e.target.value)}
                                    className="w-[140px]"
                                />
                                <span className="text-muted-foreground">-</span>
                                <Input
                                    type="date"
                                    value={tempEnd}
                                    onChange={(e) => setTempEnd(e.target.value)}
                                    className="w-[140px]"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button size="sm" onClick={handleManualApply}>应用</Button>
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

function formatDateDisplay(date: Date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
