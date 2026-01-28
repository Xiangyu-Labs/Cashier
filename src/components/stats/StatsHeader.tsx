"use client";


import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeType, addPeriod } from "@/lib/date-utils";
import { useTranslations } from "next-intl";

interface StatsHeaderProps {
    rangeType: DateRangeType;
    setRangeType: (type: DateRangeType) => void;
    currentDate: Date;
    setCurrentDate: (date: Date) => void;
    label: string;
    totalExpense: number;
    averageDaily: number;
    currencySymbol?: string;
}

export function StatsHeader({
    rangeType,
    setRangeType,
    currentDate,
    setCurrentDate,
    label,
    totalExpense,
    averageDaily,
    currencySymbol = "CNY",
}: StatsHeaderProps) {
    const t = useTranslations("StatsTab");
    const handlePrev = () => setCurrentDate(addPeriod(currentDate, rangeType, -1));
    const handleNext = () => setCurrentDate(addPeriod(currentDate, rangeType, 1));

    return (
        <div className="flex flex-col gap-6 bg-surface">
            {/* 1. Date Range Switcher (Segmented Control) */}
            <div className="flex p-1 bg-surface2 rounded-lg self-center w-full max-w-xs">
                {(["week", "month", "year"] as DateRangeType[]).map((type) => (
                    <button
                        key={type}
                        onClick={() => {
                            setRangeType(type);
                            setCurrentDate(new Date());
                        }}
                        className={cn(
                            "flex-1 text-sm py-1.5 rounded-md transition-all font-medium",
                            rangeType === type
                                ? "bg-surface text-primary shadow-sm"
                                : "text-muted hover:text-text"
                        )}
                    >
                        {t(type)}
                    </button>
                ))}
            </div>

            {/* 2. Date Navigator */}
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handlePrev}
                        className="p-1.5 text-muted hover:text-text hover:bg-surface2 rounded-full transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="text-lg font-semibold min-w-[8rem] text-center tabular-nums">
                        {label}
                    </div>
                    <button
                        onClick={handleNext}
                        className="p-1.5 text-muted hover:text-text hover:bg-surface2 rounded-full transition-colors"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* 3. Summary Stats */}
            <div className="flex flex-col items-center gap-1">
                <div className="text-sm text-muted">{t("totalExpense")}</div>
                <div className="text-4xl font-bold font-mono tracking-tight text-text flex items-baseline gap-2">
                    <span className="text-xl text-muted font-normal">{currencySymbol}</span>
                    {totalExpense.toFixed(2)}
                </div>
                <div className="text-xs text-muted flex items-center gap-1">
                    {t("averageDaily")} <span className="font-mono">{averageDaily.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
