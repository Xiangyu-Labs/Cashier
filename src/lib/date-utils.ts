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
    label: string;
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
    let label: string;

    switch (type) {
        case "week":
            start = getStartOfWeek(date);
            end = getEndOfWeek(date);
            label = `${format(start, "M.d")}-${format(end, "M.d")}`;
            break;
        case "month":
            start = getStartOfMonth(date);
            end = getEndOfMonth(date);
            label = format(start, "yyyy年M月");
            break;
        case "year":
            start = getStartOfYear(date);
            end = getEndOfYear(date);
            label = format(start, "yyyy年");
            break;
    }

    return { startDate: start, endDate: end, label };
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
