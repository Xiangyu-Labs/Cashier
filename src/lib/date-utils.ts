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
    format,
} from "date-fns";

export type DateRangeType = "week" | "month" | "year";

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

export function getDateRange(date: Date, type: DateRangeType): DateRange {
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
    }

    return { startDate: start, endDate: end };
}

export function addPeriod(date: Date, type: DateRangeType, amount: number): Date {
    switch (type) {
        case "week":
            return addWeeks(date, amount);
        case "month":
            return addMonths(date, amount);
        case "year":
            return addYears(date, amount);
    }
}

export function formatDateForApi(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

/**
 * Format date to full ISO-like string using LOCAL time (not UTC).
 * This avoids timezone issues where toISOString() would convert to UTC
 * (e.g., Feb 1 00:00 CST -> Jan 31 16:00 UTC).
 */
export function formatDateTimeForApi(date: Date): string;
export function formatDateTimeForApi(date: Date | undefined): string | undefined;
export function formatDateTimeForApi(date: Date | undefined): string | undefined {
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
}
