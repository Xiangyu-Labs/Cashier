"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEnhancedStats } from "@/features/stats/server/actions";


import {
    DateRangeType,
    getDateRange,
    formatDateForApi,
} from "@/lib/date-utils";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { StatsChart } from "@/components/stats/StatsChart";
import { StatsRanking } from "@/components/stats/StatsRanking";
import { useTranslations, useFormatter } from "next-intl";

interface StatsTabProps {
    ledgerId?: string;
    // We can fetch ledger inside if not passed, but better valid to pass it if available.
    // However, to keep it simple and consistent with existing pattern in this file (fetching summary),
    // let's see. `fetchLedger` is available.
    // But modifying the props is cleaner if parent has it.
    // Let's stick to modifying the calculation first.
    // If I don't have ledger object, I can't know main currency without fetching it.
    // I will add a `ledger` prop.
    ledger?: import("@/types/api").Ledger;
}

export function StatsTab({ ledgerId, ledger }: StatsTabProps) {
    const t = useTranslations("StatsTab");
    const format = useFormatter();
    const [rangeType, setRangeType] = useState<DateRangeType>("month");
    const [currentDate, setCurrentDate] = useState(new Date());

    const { startDate, endDate } = useMemo(
        () => getDateRange(currentDate, rangeType),
        [currentDate, rangeType]
    );

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

    const { data: stats, isLoading } = useQuery({
        queryKey: [
            "enhanced-stats",
            ledgerId,
            formatDateForApi(startDate),
            rangeType,
            ledger?.metadata?.settings?.mainCurrency,
        ],
        queryFn: () =>
            getEnhancedStats({
                ledgerId: ledgerId || "",
                rangeType,
                currentDate: startDate.toISOString(),
            }),
        enabled: !!ledgerId,
    });

    // Note: getEnhancedStats signature: ({ ledgerId, rangeType, currentDate }) -> Promise<EnhancedStats>
    // I need to import it.

    const totalExpense = stats?.summary.total || 0;
    const currencySymbol = stats?.summary.currency || ledger?.metadata?.settings?.mainCurrency || "CNY";
    const averageDaily = stats?.summary.dailyAverage || 0;
    const trend = stats?.summary.trend;

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
                total={totalExpense}
                isLoading={isLoading}
                currencySymbol={currencySymbol}
            />
        </div>
    );
}
