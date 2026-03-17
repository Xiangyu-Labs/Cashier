"use client";

import { useCallback, useMemo } from "react";
import { type PeriodParams, periodToDateRange, parsePeriodFromSearchParams } from "@/lib/period-utils";
import type { EntryFilters } from "@/features/ledger/components/EntryFilterPanel";

export interface FilterParams {
    categoryId: string | null;
    currency: string | null;
    minAmount: number | null;
    maxAmount: number | null;
}

interface UsePeriodFilterParams {
    pathname: string;
    searchParams: URLSearchParams;
    initialPeriod: PeriodParams;
}

interface UsePeriodFilterReturn {
    periodParams: PeriodParams;
    dateRange: { startDate: string | null; endDate: string | null };
    filters: EntryFilters;
    filterParams: FilterParams;
    handlePeriodChange: (newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => void;
    handleFiltersChange: (newFilters: EntryFilters) => void;
}

export function usePeriodFilter({ pathname, searchParams, initialPeriod: _initialPeriod }: UsePeriodFilterParams): UsePeriodFilterReturn {
    // 从 URL 实时派生 periodParams，确保 URL 变化时自动同步
    const periodParams = useMemo<PeriodParams>(() => {
        const parsed = parsePeriodFromSearchParams(searchParams);
        return parsed;
    }, [searchParams]);

    // Compute date range from period (memoized)
    const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

    // Read filter params from URL (single source of truth)
    const filterParams = useMemo<FilterParams>(() => ({
        categoryId: searchParams.get("categoryId"),
        currency: searchParams.get("currency"),
        minAmount: searchParams.get("minAmount") ? Number(searchParams.get("minAmount")) : null,
        maxAmount: searchParams.get("maxAmount") ? Number(searchParams.get("maxAmount")) : null,
    }), [searchParams]);

    // Convert to EntryFilters format for compatibility
    const filters: EntryFilters = useMemo(() => ({
        startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
        endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
        categoryId: filterParams.categoryId,
        currency: filterParams.currency,
        minAmount: filterParams.minAmount,
        maxAmount: filterParams.maxAmount,
    }), [dateRange, filterParams]);

    // Handle period change - only update URL, state is derived from URL
    const handlePeriodChange = useCallback((newPeriod: PeriodParams, options?: { skipUrlUpdate?: boolean }) => {
        if (options?.skipUrlUpdate) return;

        // Update URL without navigation
        // Preserve existing filter params (categoryId, currency, minAmount, maxAmount)
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
            // No dates means "thisMonth"
            handlePeriodChange({ period: 'thisMonth' });
        }
    }, [handlePeriodChange]);

    return {
        periodParams,
        dateRange,
        filters,
        filterParams,
        handlePeriodChange,
        handleFiltersChange,
    };
}
