export type DateRangeType = "week" | "month" | "year";

export interface DateRange {
    startDate: Date;
    endDate: Date;
    label: string;
}

export function getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfWeek(date: Date): Date {
    const d = getStartOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getStartOfMonth(date: Date): Date {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfMonth(date: Date): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getStartOfYear(date: Date): Date {
    const d = new Date(date);
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfYear(date: Date): Date {
    const d = new Date(date);
    d.setMonth(11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getDateRange(date: Date, type: DateRangeType): DateRange {
    let start: Date;
    let end: Date;
    let label: string;

    switch (type) {
        case "week":
            start = getStartOfWeek(date);
            end = getEndOfWeek(date);
            const startStr = `${start.getMonth() + 1}.${start.getDate()}`;
            const endStr = `${end.getMonth() + 1}.${end.getDate()}`;
            label = `${startStr}-${endStr}`;
            break;
        case "month":
            start = getStartOfMonth(date);
            end = getEndOfMonth(date);
            label = `${start.getFullYear()}年${start.getMonth() + 1}月`;
            break;
        case "year":
            start = getStartOfYear(date);
            end = getEndOfYear(date);
            label = `${start.getFullYear()}年`;
            break;
    }

    return { startDate: start, endDate: end, label };
}

export function addPeriod(date: Date, type: DateRangeType, amount: number): Date {
    const newDate = new Date(date);
    switch (type) {
        case "week":
            newDate.setDate(newDate.getDate() + amount * 7);
            break;
        case "month":
            newDate.setMonth(newDate.getMonth() + amount);
            break;
        case "year":
            newDate.setFullYear(newDate.getFullYear() + amount);
            break;
    }
    return newDate;
}

export function formatDateForApi(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
