// 
// In a real app we might fetch this from DB, but for now we'll pass it in
// to keep functions pure-ish or assume we fetch it before calling.

/**
 * Converts an amount from one currency to another using the provided rates for a specific date.
 * If rates are missing or conversion is impossible, it returns the original amount (fallback).
 * 
 * Logic: 
 * Base is usually EUR. 
 * Target = Amount / Rate(Source) * Rate(Target)
 */
export function convertAmount({
    amount,
    fromCurrency,
    toCurrency,
    rates, // Rates for the specific date of transaction
    baseCurrency = "EUR"
}: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
    rates: Record<string, number> | null;
    baseCurrency?: string;
}): number {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
        return amount;
    }

    if (!rates) {
        // No rates available for this date, fallback to 1:1 or return original
        // Ideally we should warn, but for UI we might just return original
        return amount;
    }

    // Normalizing keys slightly? Usually rates keys are "USD", "CNY", etc.
    const sourceRate = fromCurrency === baseCurrency ? 1 : rates[fromCurrency];
    const targetRate = toCurrency === baseCurrency ? 1 : rates[toCurrency];

    if (!sourceRate || !targetRate) {
        // Missing specific currency rate
        return amount;
    }

    // Calculation:
    // 1. Convert to Base: Amount / SourceRate
    // 2. Convert to Target: (Amount / SourceRate) * TargetRate
    return (amount / sourceRate) * targetRate;
}

export function calculateGrowth(current: number, previous: number): { percent: number; amount: number } {
    const diff = current - previous;
    if (previous === 0) {
        // If previous was 0 and current is > 0, it's 100% growth (technically infinite, but 100% is reasonable for UI)
        // If both 0, it's 0.
        return {
            amount: diff,
            percent: current === 0 ? 0 : 100
        };
    }

    return {
        amount: diff,
        percent: (diff / previous) * 100
    };
}
