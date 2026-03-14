/**
 * Formatting Utilities
 *
 * Shared formatting functions for amounts, numbers, and other data types.
 */

/**
 * Parse amount string to number
 * @param amount - Amount string or null/undefined
 * @returns Parsed number, or 0 if null/undefined/invalid
 */
export function parseAmount(amount: string | null | undefined): number {
    if (amount == null) return 0;
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse amount string to number with a fallback value
 * @param amount - Amount string or null/undefined
 * @param fallback - Fallback value if null/undefined/invalid
 * @returns Parsed number, or fallback if null/undefined/invalid
 */
export function parseAmountWithFallback(
    amount: string | null | undefined,
    fallback: number
): number {
    if (amount == null) return fallback;
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? fallback : parsed;
}

/**
 * Format amount to standard decimal string (2 decimal places)
 * @param amount - Number to format
 * @returns Formatted string with 2 decimal places
 */
export function formatAmountStandard(amount: number): string {
    return amount.toFixed(2);
}

/**
 * Format amount for compact display
 * - >= 10000: shows as X万
 * - >= 1000: shows as Xk
 * - < 1000: shows as X.XX
 *
 * @param amount - Number to format
 * @returns Formatted compact string
 */
export function formatAmountCompact(amount: number): string {
    if (amount >= 10000) {
        return `${(amount / 10000).toFixed(1)}万`;
    }
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return amount.toFixed(2);
}

/**
 * Format number for display with thousands separator
 * @param value - Number to format
 * @param minimumFractionDigits - Minimum decimal places (default: 2)
 * @param maximumFractionDigits - Maximum decimal places (default: 2)
 * @returns Formatted string with locale-specific separators
 */
export function formatNumber(
    value: number,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits,
        maximumFractionDigits,
    });
}

/**
 * Calculate total from an array of items with amount fields
 * @param items - Array of items
 * @param amountGetter - Function to extract amount from item
 * @returns Total sum
 */
export function calculateTotal<T>(
    items: T[],
    amountGetter: (item: T) => string | null | undefined
): number {
    return items.reduce((sum, item) => {
        return sum + parseAmount(amountGetter(item));
    }, 0);
}
