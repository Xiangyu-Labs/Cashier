"use client";

import { useState, useCallback, useMemo } from "react";
import { PeriodParams, periodToDateRange } from "@/lib/period-utils";
import type { EntryFilters } from "@/features/ledger/components/EntryFilterPanel";

interface UsePeriodFilterParams {
    pathname: string;
    searchParams: URLSearchParams;
    initialPeriod: PeriodParams;
}

export function usePeriodFilter({ pathname, searchParams, initialPeriod }: UsePeriodFilterParams) {
    // Period state - initialized from URL (via props), no useEffect needed
    const [periodParams, setPeriodParams] = useState<PeriodParams>(initialPeriod);

    // Compute date range from period (memoized)
    const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

    // Convert to EntryFilters format for compatibility
    const filters: EntryFilters = useMemo(() => ({
        startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
        endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
    }), [dateRange]);

    // Handle period change - update both state and URL
    const handlePeriodChange = useCallback((newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
        setPeriodParams(newPeriod);

        if (options?.skipUrlUpdate) return;

        // Update URL without navigation
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', newPeriod.period);

        if (newPeriod.period === 'custom') {
            if (newPeriod.startDate) params.set('startDate', newPeriod.startDate);
            if (newPeriod.endDate) params.set('endDate', newPeriod.endDate);
        } else {
            params.delete('startDate');
            params.delete('endDate');
        }

        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    }, [pathname, searchParams]);

    // Handle filter changes from EntryFilterPanel (for advanced filters like amount)
    const handleFiltersChange = useCallback((newFilters: EntryFilters) => {
        // If date changed, update period to custom
        if (newFilters.startDate || newFilters.endDate) {
            const formatDate = (d?: Date): string | undefined => {
                if (!d) return undefined;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };
            handlePeriodChange({
                period: 'custom',
                startDate: formatDate(newFilters.startDate),
                endDate: formatDate(newFilters.endDate),
            });
        } else {
            // No dates means "all"
            handlePeriodChange({ period: 'all' });
        }
    }, [handlePeriodChange]);

    return {
        periodParams,
        dateRange,
        filters,
        handlePeriodChange,
        handleFiltersChange,
    };
}
