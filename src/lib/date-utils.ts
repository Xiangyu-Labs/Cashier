import {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    addWeeks,
    addMonths,
    addYears,
    startOfDay,
    endOfDay,
    parseISO,
} from "date-fns";

export type DateRangeType = "week" | "month" | "year" | "currentPeriod";

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export function getStartOfWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

export function getEndOfWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: 1 });
}

export function getStartOfMonth(date: Date): Date {
    return startOfMonth(date);
}

export function getEndOfMonth(date: Date): Date {
    return endOfMonth(date);
}

export function getStartOfYear(date: Date): Date {
    return startOfYear(date);
}

export function getEndOfYear(date: Date): Date {
    return endOfYear(date);
}

export function getDateRange(date: Date, type: DateRangeType, monthStartDay?: number): DateRange {
    let start: Date;
    let end: Date;

    switch (type) {
        case "week":
            start = getStartOfWeek(date);
            end = getEndOfWeek(date);
            break;
        case "month":
            start = getStartOfMonth(date);
            end = getEndOfMonth(date);
            break;
        case "year":
            start = getStartOfYear(date);
            end = getEndOfYear(date);
            break;
        case "currentPeriod":
            return getBillingPeriodRange(date, monthStartDay || 1);
    }

    return { startDate: start, endDate: end };
}

/**
 * Calculate billing period range based on month start day.
 * Returns the billing period that contains the given date.
 */
function getBillingPeriodRange(date: Date, monthStartDay: number): DateRange {
    const currentDay = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    function getActualDate(y: number, m: number, targetDay: number): Date {
        const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
        const actualDay = Math.min(targetDay, lastDayOfMonth);
        return new Date(y, m, actualDay);
    }

    let startDate: Date;
    let endDate: Date;

    if (currentDay >= monthStartDay) {
        // Current date is on or after period start day, belongs to current period
        startDate = getActualDate(year, month, monthStartDay);
        endDate = getActualDate(year, month + 1, monthStartDay - 1);
    } else {
        // Current date is before period start day, belongs to previous period
        startDate = getActualDate(year, month - 1, monthStartDay);
        endDate = getActualDate(year, month, monthStartDay - 1);
    }

    return { startDate, endDate };
}

export function addPeriod(date: Date, type: DateRangeType, amount: number): Date {
    switch (type) {
        case "week":
            return addWeeks(date, amount);
        case "month":
            return addMonths(date, amount);
        case "year":
            return addYears(date, amount);
        case "currentPeriod":
            // For billing periods, we move by months (since billing periods are month-based)
            return addMonths(date, amount);
    }
}

/**
 * Serialize database date fields to ISO strings for API responses.
 * Handles the common pattern of createdAt, updatedAt, and deletedAt fields.
 *
 * @param row - Database row with date fields
 * @returns Object with dates serialized to ISO strings
 */
export function serializeDates<T extends { createdAt: Date; updatedAt: Date; deletedAt: Date | null }>(row: T) {
    return {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
    };
}

/**
 * Format date to yyyy-MM-dd string using LOCAL time (not UTC).
 * 
 * This completely avoids timezone issues by only transmitting the date portion.
 * The backend is responsible for interpreting startDate as "start of day" 
 * and endDate as "end of day" when constructing queries.
 * 
 * Why not include time? Because:
 * 1. User selects dates in their local timezone
 * 2. Server may run in a different timezone (e.g., UTC in Docker)
 * 3. Using just the date makes the intention unambiguous
 */
export function formatDateTimeForApi(date: Date): string;
export function formatDateTimeForApi(date: Date | undefined): string | undefined;
export function formatDateTimeForApi(date: Date | undefined): string | undefined {
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parse a date string as the START of day (00:00:00.000).
 * Used by backend to construct query conditions for startDate parameters.
 * 
 * Uses date-fns for reliable parsing and day boundary calculation.
 */
export function parseDateRangeStart(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;

    // parseISO handles both "yyyy-MM-dd" and full ISO strings
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return null;

    return startOfDay(parsed);
}

/**
 * Parse a date string as the END of day (23:59:59.999).
 * Used by backend to construct query conditions for endDate parameters.
 * 
 * Uses date-fns for reliable parsing and day boundary calculation.
 */
export function parseDateRangeEnd(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;

    // parseISO handles both "yyyy-MM-dd" and full ISO strings
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return null;

    return endOfDay(parsed);
}

/**
 * Parse a "YYYY-MM-DD" string as a local-time Date (midnight local).
 *
 * IMPORTANT: Do NOT use `new Date("YYYY-MM-DD")` — JS spec treats date-only
 * strings as UTC midnight, which shifts the date in non-UTC timezones.
 * This function always creates the date in the runtime's local timezone.
 */
export function parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Get today's date (YYYY-MM-DD) in a specific timezone.
 * Uses Intl API — works regardless of server's TZ setting.
 */
export function getDateInTimezone(timezone?: string): string | undefined {
    if (!timezone) return undefined;
    try {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
    } catch {
        return undefined; // invalid timezone string
    }
}
