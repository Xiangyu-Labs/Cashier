"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLedgerEntrySummary } from "@/lib/api";
import {
    DateRangeType,
    getDateRange,
    formatDateForApi,
} from "@/lib/date-utils";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { StatsChart } from "@/components/stats/StatsChart";
import { StatsRanking } from "@/components/stats/StatsRanking";
import { useTranslations } from "next-intl";

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
            formatDateForApi(startDate),
            formatDateForApi(endDate),
            ledger?.mainCurrency,
        ],
        queryFn: () =>
            fetchLedgerEntrySummary(
                ledgerId || "",
                formatDateForApi(startDate),
                formatDateForApi(endDate),
                ledger?.mainCurrency
            ),
        enabled: !!ledgerId,
    });

    // Sum all totals for the main currency view
    const totalExpense = summary?.convertedTotal?.total
        || summary?.totals.reduce((sum, t) => sum + t.total, 0)
        || 0;
    const currencySymbol = ledger?.mainCurrency || "CNY";

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
                    {t("expenseTrend")}
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
