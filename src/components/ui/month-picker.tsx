"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MonthPickerProps {
    date: Date;
    onDateChange: (date: Date) => void;
}

export function MonthPicker({ date, onDateChange }: MonthPickerProps) {
    const [year, setYear] = React.useState(date.getFullYear());
    const [open, setOpen] = React.useState(false);

    // Sync internal state when prop changes
    React.useEffect(() => {
        setYear(date.getFullYear());
    }, [date]);

    const months = [
        "1月", "2月", "3月", "4月",
        "5月", "6月", "7月", "8月",
        "9月", "10月", "11月", "12月"
    ];

    const handleMonthSelect = (monthIndex: number) => {
        const newDate = new Date(year, monthIndex, 1);
        onDateChange(newDate);
        setOpen(false);
    };

    const handlePrevYear = () => setYear(prev => prev - 1);
    const handleNextYear = () => setYear(prev => prev + 1);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-semibold text-lg hover:bg-transparent px-1 gap-1"
                >
                    {date.getFullYear()}年{date.getMonth() + 1}月
                    <span className="text-muted-foreground scale-75">▼</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 z-[2000]" align="start">
                <div className="flex items-center justify-between mb-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevYear}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="font-semibold">{year}年</div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextYear}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {months.map((month, index) => (
                        <Button
                            key={month}
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMonthSelect(index)}
                            className={cn(
                                "text-sm",
                                year === date.getFullYear() && index === date.getMonth()
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "hover:bg-muted"
                            )}
                        >
                            {index + 1}月
                        </Button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
