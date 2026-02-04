"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
    DateRangeType,
    getDateRange,
    formatDateForApi,
    formatDateTimeForApi,
} from "@/lib/date-utils";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { StatsChart } from "@/components/stats/StatsChart";
import { StatsRanking } from "@/components/stats/StatsRanking";
import { useTranslations, useFormatter } from "next-intl";

interface StatsTabProps {
    ledgerId?: string;
    ledger?: import("@/types/api").Ledger;
}

export function StatsTab({ ledgerId, ledger }: StatsTabProps) {
    const t = useTranslations("StatsTab");
    const format = useFormatter();
    const queryClient = useQueryClient();
    const [rangeType, setRangeType] = useState<DateRangeType>("month");
    const [currentDate, setCurrentDate] = useState(new Date());

    const { startDate, endDate } = useMemo(
        () => getDateRange(currentDate, rangeType),
        [currentDate, rangeType]
    );

    const { startDate: prevDateStart, endDate: prevDateEnd } = useMemo(() => {
        const prevAnchor = new Date(currentDate);
        if (rangeType === 'week') prevAnchor.setDate(prevAnchor.getDate() - 7);
        if (rangeType === 'month') prevAnchor.setMonth(prevAnchor.getMonth() - 1);
        if (rangeType === 'year') prevAnchor.setFullYear(prevAnchor.getFullYear() - 1);

        return getDateRange(prevAnchor, rangeType);
    }, [currentDate, rangeType]);

    const label = useMemo(() => {
        switch (rangeType) {
            case "week":
                return `${format.dateTime(startDate, { month: "numeric", day: "numeric" })} - ${format.dateTime(endDate, { month: "numeric", day: "numeric" })}`;
            case "month":
                return format.dateTime(startDate, { year: "numeric", month: "long" });
            case "year":
                return format.dateTime(startDate, { year: "numeric" });
            default:
                return "";
        }
    }, [startDate, endDate, rangeType, format]);

    const enhancedStatsKey = [...queryKeys.enhancedStats(ledgerId || ''), formatDateForApi(startDate), rangeType, ledger?.metadata?.settings?.mainCurrency];
    const { data: stats, isLoading } = useQuery({
        queryKey: enhancedStatsKey,
        queryFn: () =>
            getEnhancedStats({
                ledgerId: ledgerId || "",
                queryRange: {
                    from: formatDateTimeForApi(startDate),
                    to: formatDateTimeForApi(endDate)
                },
                compareRange: {
                    from: formatDateTimeForApi(prevDateStart),
                    to: formatDateTimeForApi(prevDateEnd)
                }
            }),
        enabled: !!ledgerId,
    });

    const totalExpense = stats?.summary.total || 0;
    const currencySymbol = stats?.summary.currency || ledger?.metadata?.settings?.mainCurrency || "CNY";
    const averageDaily = stats?.summary.dailyAverage || 0;
    const trend = stats?.summary.trend;

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.enhancedStats(ledgerId || '') });
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 pb-24">
                <StatsHeader
                    rangeType={rangeType}
                    setRangeType={setRangeType}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                    label={label}
                    totalExpense={totalExpense}
                    averageDaily={averageDaily}
                    currencySymbol={currencySymbol}
                    trend={trend}
                />

                <div className="space-y-2">
                    <h3 className="font-semibold px-2 text-sm text-muted-foreground uppercase tracking-wider">
                        {t("expenseTrend")}
                    </h3>
                    <StatsChart
                        data={stats?.chart || []}
                        rangeType={rangeType}
                        startDate={startDate}
                        endDate={endDate}
                        isLoading={isLoading}
                    />
                </div>

                <StatsRanking
                    data={stats?.categories || []}
                    isLoading={isLoading}
                    currencySymbol={currencySymbol}
                />
            </div>
        </PullToRefresh>
    );
}
