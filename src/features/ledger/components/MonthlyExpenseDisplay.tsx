"use client";

import { useQuery } from "@tanstack/react-query";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { queryKeys } from "@/lib/query-keys";
import { getBillingPeriod } from "@/lib/period-utils";

interface MonthlyExpenseDisplayProps {
    ledgerId: string;
    monthStartDay: number;
    mainCurrency: string;
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
