"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactionSummary } from "@/lib/api";
import {
    DateRangeType,
    getDateRange,
    formatDateForApi,
} from "@/lib/date-utils";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { StatsChart } from "@/components/stats/StatsChart";
import { StatsRanking } from "@/components/stats/StatsRanking";

interface StatsTabProps {
    ledgerId?: string;
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

    // Find the currency with the highest total expense
    const primaryCurrencyTotal = summary?.totals.reduce((max, current) => {
        return (current.total > (max?.total || 0)) ? current : max;
    }, summary?.totals[0]);

    const totalExpense = primaryCurrencyTotal?.total || 0;
    const currencySymbol = primaryCurrencyTotal?.currency || "CNY";

    const daysInPeriod = Math.max(
        1,
        Math.ceil(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        )
    );
    const averageDaily = totalExpense / daysInPeriod;

    return (
        <div className="space-y-8 pb-24">
            <StatsHeader
                rangeType={rangeType}
                setRangeType={setRangeType}
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                label={label}
                totalExpense={totalExpense}
                averageDaily={averageDaily}
                currencySymbol={currencySymbol}
            />

            <div className="space-y-2">
                <h3 className="font-semibold px-2 text-sm text-muted uppercase tracking-wider">
                    支出趋势
                </h3>
                <StatsChart
                    data={summary?.trend || []}
                    rangeType={rangeType}
                    startDate={startDate}
                    endDate={endDate}
                    isLoading={isLoading}
                />
            </div>

            <StatsRanking
                data={summary?.byCategory || []}
                total={totalExpense}
                isLoading={isLoading}
            />
        </div>
    );
}
