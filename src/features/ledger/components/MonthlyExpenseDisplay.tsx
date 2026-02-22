"use client";

import { useQuery } from "@tanstack/react-query";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { queryKeys } from "@/lib/query-keys";

interface MonthlyExpenseDisplayProps {
    ledgerId: string;
    monthStartDay: number;
    mainCurrency: string;
}

/**
 * Calculate billing period based on month start day
 * Returns startDate and endDate in yyyy-MM-dd format
 */
function getBillingPeriod(monthStartDay: number): { startDate: string; endDate: string } {
    const today = new Date();
    const currentDay = today.getDate();
    const year = today.getFullYear();
    const month = today.getMonth();

    // Helper: get actual day for a given year/month (handles month-end boundaries)
    function getActualDate(y: number, m: number, targetDay: number): Date {
        const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
        const actualDay = Math.min(targetDay, lastDayOfMonth);
        return new Date(y, m, actualDay);
    }

    let startDate: Date;
    let endDate: Date;

    if (currentDay >= monthStartDay) {
        // Current period: from this month's start day to next month's (startDay - 1)
        startDate = getActualDate(year, month, monthStartDay);
        endDate = getActualDate(year, month + 1, monthStartDay - 1);
    } else {
        // Previous period: from last month's start day to this month's (startDay - 1)
        startDate = getActualDate(year, month - 1, monthStartDay);
        endDate = getActualDate(year, month, monthStartDay - 1);
    }

    // Format as yyyy-MM-dd
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
    };
}

export function MonthlyExpenseDisplay({
    ledgerId,
    monthStartDay,
    mainCurrency,
}: MonthlyExpenseDisplayProps) {
    const { startDate, endDate } = getBillingPeriod(monthStartDay);

    const { data: statsData } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'monthly-expense', startDate, endDate, mainCurrency),
        queryFn: () => getLedgerStatsAction(ledgerId, startDate, endDate, mainCurrency),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const total = statsData?.convertedTotal?.total || 0;
    const currency = statsData?.convertedTotal?.currency || mainCurrency;

    return (
        <div className="flex items-center gap-1 text-sm font-mono">
            <span className="text-xs text-muted-foreground">{currency}</span>
            <span className="font-semibold">{total.toFixed(2)}</span>
        </div>
    );
}
