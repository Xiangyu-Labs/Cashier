"use client";


import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
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
    trend?: {
        percent: number;
        amount: number;
    };
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
    trend,
}: StatsHeaderProps) {
    const t = useTranslations("StatsTab");
    const handlePrev = () => setCurrentDate(addPeriod(currentDate, rangeType, -1));
    const handleNext = () => setCurrentDate(addPeriod(currentDate, rangeType, 1));

    // Trend Logic: Expense Increase = Bad (Red/Danger), Decrease = Good (Green/Primary)
    // But color perception varies. Let's use:
    // Increase: destructive (Red)
    // Decrease: primary (Green/Brand)
    const isIncrease = trend && trend.amount > 0;
    const isDecrease = trend && trend.amount < 0;

    // Formatting trend percent
    const trendPercent = trend ? Math.abs(trend.percent).toFixed(1) : "0.0";

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
                                : "text-muted-foreground hover:text-text"
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
                        className="p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="text-lg font-semibold min-w-[8rem] text-center tabular-nums">
                        {label}
                    </div>
                    <button
                        onClick={handleNext}
                        className="p-1.5 text-muted-foreground hover:text-text hover:bg-surface2 rounded-full transition-colors"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* 3. Summary Stats */}
            <div className="flex flex-col items-center gap-2">
                <div className="text-sm text-muted-foreground">{t("totalExpense")}</div>
                <div className="text-4xl font-bold font-mono tracking-tight text-text flex items-baseline gap-2">
                    <span className="text-xl text-muted-foreground font-normal">{currencySymbol}</span>
                    {totalExpense.toFixed(2)}
                </div>

                {/* Trend Section */}
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full mt-1",
                        isIncrease ? "bg-destructive/10 text-destructive" :
                            isDecrease ? "bg-primary/10 text-primary" : "bg-surface2 text-muted-foreground"
                    )}>
                        {isIncrease ? <TrendingUp size={14} /> : isDecrease ? <TrendingDown size={14} /> : <Minus size={14} />}
                        <span>
                            {isIncrease ? "+" : isDecrease ? "-" : ""}
                            {trendPercent}% {t("vsPreviousPeriod")}
                        </span>
                    </div>
                )}

                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    {t("averageDaily")} <span className="font-mono">{averageDaily.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
