/**
 * Period-based filter utilities for URL-driven state management.
 *
 * Used by both server (page.tsx) and client (LedgerEntriesTab) to ensure
 * consistent date range calculation and query key matching.
 */

import { formatDateTimeForApi } from './date-utils';

export type PeriodPreset = 'all' | 'thisMonth' | 'week' | 'custom';

export interface PeriodParams {
    period: PeriodPreset;
    startDate?: string;  // YYYY-MM-DD format (only for 'custom')
    endDate?: string;    // YYYY-MM-DD format (only for 'custom')
}

export interface DateRange {
    startDate: string | null;  // ISO datetime string for API
    endDate: string | null;    // ISO datetime string for API
}

/**
 * Convert period preset to actual date range.
 * Works on both server and client.
 */
export function periodToDateRange(params: PeriodParams): DateRange {
    const { period, startDate, endDate } = params;

    if (period === 'all') {
        return { startDate: null, endDate: null };
    }

    if (period === 'custom' && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59.999`);
        return {
            startDate: formatDateTimeForApi(start) ?? null,
            endDate: formatDateTimeForApi(end) ?? null,
        };
    }

    const now = new Date();

    if (period === 'thisMonth') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return {
            startDate: formatDateTimeForApi(monthStart) ?? null,
            endDate: formatDateTimeForApi(monthEnd) ?? null,
        };
    }

    if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        return {
            startDate: formatDateTimeForApi(weekAgo) ?? null,
            endDate: formatDateTimeForApi(endOfToday) ?? null,
        };
    }

    // Default to thisMonth if unknown period
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
        startDate: formatDateTimeForApi(monthStart) ?? null,
        endDate: formatDateTimeForApi(monthEnd) ?? null,
    };
}

/**
 * Parse period parameters from URL search params.
 * Works with both server searchParams object and URLSearchParams.
 */
export function parsePeriodFromSearchParams(
    searchParams: { [key: string]: string | string[] | undefined } | URLSearchParams | { get: (key: string) => string | null }
): PeriodParams {
    let period: string | null = null;
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (searchParams instanceof URLSearchParams || typeof (searchParams as { get?: unknown }).get === 'function') {
        // URLSearchParams or similar interface
        const sp = searchParams as { get: (key: string) => string | null };
        period = sp.get('period');
        startDate = sp.get('startDate') ?? undefined;
        endDate = sp.get('endDate') ?? undefined;
    } else {
        // Plain object from Next.js server searchParams
        const sp = searchParams as { [key: string]: string | string[] | undefined };
        const periodValue = sp.period;
        period = Array.isArray(periodValue) ? periodValue[0] : periodValue ?? null;
        const startValue = sp.startDate;
        startDate = Array.isArray(startValue) ? startValue[0] : startValue;
        const endValue = sp.endDate;
        endDate = Array.isArray(endValue) ? endValue[0] : endValue;
    }

    // Validate period value
    const validPeriods: PeriodPreset[] = ['all', 'thisMonth', 'week', 'custom'];
    const validatedPeriod: PeriodPreset = validPeriods.includes(period as PeriodPreset)
        ? (period as PeriodPreset)
        : 'thisMonth';  // Default to thisMonth

    return {
        period: validatedPeriod,
        startDate,
        endDate,
    };
}

/**
 * Convert Date objects to PeriodParams for custom date ranges.
 */
export function datesToPeriodParams(startDate?: Date, endDate?: Date): PeriodParams {
    if (!startDate || !endDate) {
        return { period: 'all' };
    }

    const formatDate = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    return {
        period: 'custom',
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
    };
}
