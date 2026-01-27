"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactionSummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    DateRangeType,
    getDateRange,
    addPeriod,
    formatDateForApi,
} from "@/lib/date-utils";

interface StatsTabProps {
    // summary?: TransactionSummary; // Keeping interface compatible but unused as we fetch our own data
    ledgerId?: string; // We need this to fetch data
}

export function StatsTab({ ledgerId }: StatsTabProps) {
    const [rangeType, setRangeType] = useState<DateRangeType>("month");
    const [currentDate, setCurrentDate] = useState(new Date());

    const { startDate, endDate, label } = useMemo(
        () => getDateRange(currentDate, rangeType),
        [currentDate, rangeType]
    );

    const { data: summary, isLoading } = useQuery({
        queryKey: [
            "summary",
            ledgerId,
            "confirmed",
            formatDateForApi(startDate),
            formatDateForApi(endDate),
        ],
        queryFn: () =>
            fetchTransactionSummary(
                ledgerId || "",
                "confirmed",
                formatDateForApi(startDate),
                formatDateForApi(endDate)
            ),
        enabled: !!ledgerId,
    });

    const handlePrev = () => setCurrentDate(addPeriod(currentDate, rangeType, -1));
    const handleNext = () => setCurrentDate(addPeriod(currentDate, rangeType, 1));

    const totalExpense = summary?.totals.find((t) => t.currency === "CNY")?.total || 0; // Assuming CNY for now or taking first found
    const daysInPeriod = Math.max(
        1,
        Math.ceil(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        )
    );
    const averageDaily = totalExpense / daysInPeriod;

    // Chart Data Preparation
    const chartData = useMemo(() => {
        if (!summary?.trend) return [];

        // Fill in missing dates for better chart
        const data: { date: string; value: number }[] = [];
        const curr = new Date(startDate);
        const end = new Date(endDate);

        // Don't project into the future too much, but for "month" view we want to see the whole month grid usually?
        // User screenshot shows the whole month axis (01-31).
        // Let's create points for every day in the range.

        while (curr <= end) {
            const dateStr = formatDateForApi(curr);
            // Use date string to match
            // Note: Backend returns date string, e.g. "2025-01-27"
            // Note 2: Date object iteration might have timezone issues if not careful, but for this simple visualization local time iteration is okay.

            const found = summary.trend.find((t) => {
                // rough match 
                return t.date.startsWith(dateStr);
            });

            data.push({
                date: String(curr.getDate()).padStart(2, "0"), // Just day usually
                value: found ? found.total : 0,
            });

            curr.setDate(curr.getDate() + 1);
        }
        return data;
    }, [summary, startDate, endDate]);

    const maxChartValue = Math.max(...chartData.map((d) => d.value), 1);

    return (
        <div className="space-y-6 pb-20">
            {/* 1. Top Navigation (Yellow Header Style from Screenshot) */}
            <div className="bg-primary text-primary-foreground -mt-4 -mx-4 p-4 pb-8 rounded-b-[2rem] shadow-sm">
                <div className="flex justify-between items-center bg-primary-foreground/20 p-1 rounded-lg mb-4">
                    {(["week", "month", "year"] as DateRangeType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => {
                                setRangeType(type);
                                setCurrentDate(new Date()); // Reset to now when switching type
                            }}
                            className={cn(
                                "flex-1 text-sm py-1 rounded-md transition-colors",
                                rangeType === type
                                    ? "bg-surface text-primary font-bold shadow-sm"
                                    : "text-primary-foreground/80 hover:bg-white/10"
                            )}
                        >
                            {type === "week" ? "周" : type === "month" ? "月" : "年"}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between text-primary-foreground">
                    <button onClick={handlePrev} className="p-1 hover:bg-white/10 rounded-full">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="font-medium text-lg border-b border-primary-foreground/30 pb-0.5 px-2">
                        {label}
                    </div>
                    <button onClick={handleNext} className="p-1 hover:bg-white/10 rounded-full">
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="mt-6 flex flex-col items-start px-2">
                    <div className="text-sm opacity-90">总支出</div>
                    <div className="text-3xl font-bold font-mono tracking-tight">
                        {totalExpense.toFixed(2)}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                        平均每日: {averageDaily.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* 2. Chart Section */}
            <Card className="border-none shadow-none bg-transparent">
                <CardContent className="p-0">
                    {/* Simple Line Chart */}
                    <div className="h-40 w-full relative pt-4">
                        {/* Y Axis Grid Lines (Optional - user screenshot has dashed lines) */}
                        <div className="absolute inset-0 flex flex-col justify-between px-2 text-[10px] text-muted-foreground/30 pointer-events-none">
                            <div className="border-b border-dashed border-border/50 w-full h-0"></div>
                            <div className="border-b border-dashed border-border/50 w-full h-0"></div>
                            <div className="border-b border-dashed border-border/50 w-full h-0"></div>
                        </div>

                        <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                            <polyline
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-primary"
                                points={chartData.map((d, i) => {
                                    const x = (i / (chartData.length - 1)) * 100;
                                    const y = 100 - (d.value / maxChartValue) * 80; // keep some padding top
                                    return `${x}%,${y}%`;
                                }).join(" ")}
                            />
                            {chartData.map((d, i) => {
                                const x = (i / (chartData.length - 1)) * 100;
                                const y = 100 - (d.value / maxChartValue) * 80;
                                if (d.value === 0) return null; // Don't show dots for 0 maybe? User screenshot has dots everywhere.
                                // User screenshot only shows some dots? Let's show all for now but small.
                                return (
                                    <circle
                                        key={i}
                                        cx={`${x}%`}
                                        cy={`${y}%`}
                                        r="3"
                                        className="fill-bg stroke-primary stroke-2"
                                    />
                                );
                            })}
                        </svg>

                        {/* X Axis Labels */}
                        <div className="flex justify-between mt-2 px-1">
                            {chartData.filter((_, i) => i % 5 === 0).map((d, i) => (
                                <span key={i} className="text-[10px] text-muted-foreground">
                                    {d.date}
                                </span>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Ranking List */}
            <div className="space-y-4">
                <h3 className="font-bold text-lg px-2">支出排行榜</h3>
                {isLoading ? (
                    <div className="text-center py-8 text-muted">加载中...</div>
                ) : summary?.byCategory.length === 0 ? (
                    <div className="text-center py-8 text-muted text-sm">本期无支出</div>
                ) : (
                    <div className="space-y-4">
                        {summary?.byCategory.map((cat, idx) => {
                            const percent = (cat.total / totalExpense) * 100;
                            return (
                                <div key={idx} className="flex items-center gap-3 px-2">
                                    <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-xl shrink-0">
                                        {cat.categoryIcon || "💰"}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between items-center text-sm font-medium">
                                            <span>{cat.categoryName} <span className="text-muted-foreground ml-1 text-xs">{percent.toFixed(1)}%</span></span>
                                            <span className="font-mono">{cat.total.toFixed(0)}</span>
                                        </div>
                                        {/* Progress Bar */}
                                        <div className="h-2 w-full bg-surface2 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
