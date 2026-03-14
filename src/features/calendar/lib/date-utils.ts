/**
 * Calendar Date Utilities
 *
 * Helper functions for calendar date calculations.
 */

import { formatDateTimeForApi } from "@/lib/date-utils";

// Re-export formatDate from centralized location to avoid duplication
export { formatDateTimeForApi as formatDate };

// Local aliases for internal use (can't use re-exports before they're defined)
const formatDate = formatDateTimeForApi;
import { parseDateString } from "@/lib/date-utils";
const parseDate = parseDateString;

// Re-export parseDateString as parseDate for backward compatibility
export { parseDateString as parseDate } from "@/lib/date-utils";

/**
 * Get days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

/**
 * Get the first day of the month (0 = Sunday, 6 = Saturday)
 */
export function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month - 1, 1).getDay();
}

/**
 * Get week dates for a given date (Sunday to Saturday)
 */
export function getWeekDates(dateStr: string): string[] {
    const date = parseDate(dateStr);
    const dayOfWeek = date.getDay();

    // Create new Date without modifying the original (immutability)
    const startOfWeek = new Date(date.getTime());
    startOfWeek.setDate(date.getDate() - dayOfWeek);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek.getTime());
        d.setDate(startOfWeek.getDate() + i);
        days.push(formatDate(d));
    }

    return days;
}

/**
 * Get month name
 */
export function getMonthName(month: number, locale = 'zh-CN'): string {
    const date = new Date(2024, month - 1, 1);
    return date.toLocaleString(locale, { month: 'long' });
}

/**
 * Get short weekday name
 */
export function getWeekdayName(dayIndex: number, locale = 'zh-CN'): string {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    if (locale === 'zh-CN') {
        return weekdays[dayIndex];
    }
    const date = new Date(2024, 0, dayIndex + 7); // Jan 7, 2024 is Sunday
    return date.toLocaleString(locale, { weekday: 'short' });
}

/**
 * Navigate to previous month
 */
export function getPreviousMonth(dateStr: string): string {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 2, 1); // month - 2 because month is 1-based
    return formatDate(date).slice(0, 7) + '-01';
}

/**
 * Navigate to next month
 */
export function getNextMonth(dateStr: string): string {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month, 1);
    return formatDate(date).slice(0, 7) + '-01';
}

/**
 * Navigate to previous week
 */
export function getPreviousWeek(dateStr: string): string {
    const date = parseDate(dateStr);
    // Create new Date without modifying the original (immutability)
    const result = new Date(date.getTime());
    result.setDate(date.getDate() - 7);
    return formatDate(result);
}

/**
 * Navigate to next week
 */
export function getNextWeek(dateStr: string): string {
    const date = parseDate(dateStr);
    // Create new Date without modifying the original (immutability)
    const result = new Date(date.getTime());
    result.setDate(date.getDate() + 7);
    return formatDate(result);
}

/**
 * Navigate to previous year
 */
export function getPreviousYear(dateStr: string): string {
    const [year] = dateStr.split('-').map(Number);
    return `${year - 1}-01-01`;
}

/**
 * Navigate to next year
 */
export function getNextYear(dateStr: string): string {
    const [year] = dateStr.split('-').map(Number);
    return `${year + 1}-01-01`;
}

/**
 * Check if date is today
 */
export function isToday(dateStr: string): boolean {
    return dateStr === formatDate(new Date());
}

/**
 * Get year range for year view (display 12 months)
 */
export function getYearMonthRange(year: number): { month: number; year: number }[] {
    return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        year,
    }));
}

// Re-export formatAmountCompact from centralized location
export { formatAmountCompact as formatAmount } from "@/lib/formatters";

/**
 * Get month grid (6 rows x 7 cols) for month view
 * Includes days from previous/next month to fill the grid
 */
export function getMonthGrid(dateStr: string): {
    date: string;
    isCurrentMonth: boolean;
    isToday: boolean;
}[] {
    const [year, month] = dateStr.split('-').map(Number);
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const grid: { date: string; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Previous month days
    const prevMonthDays = firstDay;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth);

    for (let i = prevMonthDays - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const date = `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        grid.push({ date, isCurrentMonth: false, isToday: isToday(date) });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        grid.push({ date, isCurrentMonth: true, isToday: isToday(date) });
    }

    // Next month days (fill to complete 6 rows = 42 cells)
    const remainingCells = 42 - grid.length;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;

    for (let day = 1; day <= remainingCells; day++) {
        const date = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        grid.push({ date, isCurrentMonth: false, isToday: isToday(date) });
    }

    return grid;
}
