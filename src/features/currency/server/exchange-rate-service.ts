import { db } from "@/lib/db";
import { currencyRates } from "./schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";

export interface ExchangeRates {
    base: string;
    date: string;
    rates: Record<string, number>;
}

export class ExchangeRateService {
    private static readonly API_BASE_URL = "https://api.frankfurter.app";

    private static pendingRequests = new Map<string, Promise<ExchangeRates>>();

    /**
     * Get rates for a specific date (defaults to today).
     * Uses "Daily Snapshot" strategy:
     * 1. Check DB for date.
     * 2. If missing, fetch from Frankfurter (base=EUR) and cache.
     * 3. Return rates.
     */
    static async getRates(date?: Date | string): Promise<ExchangeRates> {
        const targetDateStr = this.formatDate(date || new Date());

        // 1. Try Cache
        const cached = await db.query.currencyRates.findFirst({
            where: eq(currencyRates.date, targetDateStr),
        });

        if (cached) {
            return {
                base: cached.base,
                date: cached.date,
                rates: cached.rates as Record<string, number>,
            };
        }

        // 2. Check for pending request (Request Collapsing)
        if (this.pendingRequests.has(targetDateStr)) {
            return this.pendingRequests.get(targetDateStr)!;
        }

        // 3. Fetch from API
        const fetchPromise = (async () => {
            try {
                const response = await this.fetchWithRetry(`${this.API_BASE_URL}/${targetDateStr}?base=EUR`);

                if (!response.ok) {
                    if (response.status === 404) {
                        // Create a fallback for future dates or way past dates if needed,
                        // but 404 usually means really invalid.
                        // However, for weekends, Frankfurter usually returns the previous Friday.
                        // If it explicitly 404s, it's an error.
                        throw new Error(`Exchange rates unavailable for date: ${targetDateStr}`);
                    }
                    throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
                }

                const data: ExchangeRates = await response.json();

                // Atomic Upsert: Avoid race conditions if another instance or request writes simultaneously
                // IMPORTANT: We save using 'targetDateStr' (the requested date) instead of 'data.date'
                // because on weekends 'data.date' will be the previous Friday.
                // If we saved 'data.date', the next request for 'targetDateStr' would still be a cache miss.
                await db.insert(currencyRates)
                    .values({
                        date: targetDateStr,
                        base: data.base,
                        rates: data.rates,
                    })
                    .onConflictDoNothing();

                return data;
            } finally {
                // Remove from pending map once finished (success or failure)
                this.pendingRequests.delete(targetDateStr);
            }
        })();

        this.pendingRequests.set(targetDateStr, fetchPromise);
        return fetchPromise;
    }

    private static async fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                return await fetch(url, { signal: AbortSignal.timeout(5000) });
            } catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
            }
        }
        throw new Error("Unreachable");
    }

    /**
     * Convert amount from one currency to another using specific date's rates.
     */
    static async convert(
        amount: number,
        fromCurrency: string,
        toCurrency: string,
        date?: Date | string
    ): Promise<number> {
        if (fromCurrency === toCurrency) return amount;

        const ratesData = await this.getRates(date);
        const rates = ratesData.rates;

        // Add base currency (EUR) to rates map for easy calculation if not present
        // (Frankfurter results usually exclude the base from 'rates' object)
        const fullRates = { ...rates, [ratesData.base]: 1.0 };

        const fromRate = fullRates[fromCurrency];
        const toRate = fullRates[toCurrency];

        if (fromRate === undefined) throw new Error(`Currency not found: ${fromCurrency}`);
        if (toRate === undefined) throw new Error(`Currency not found: ${toCurrency}`);

        // Cross-Rate Calculation:
        // Target = Amount * (ToRate / FromRate)
        const result = amount * (toRate / fromRate);

        // Return with reasonable precision (client can format)
        return result;
    }

    private static formatDate(date: Date | string): string {
        if (typeof date === "string") return date.split("T")[0];
        return format(date, "yyyy-MM-dd");
    }

    /**
     * Batch convert multiple amounts, optimizing DB queries by pre-loading rates.
     * For N items with M unique dates, this performs M DB queries instead of N.
     */
    static async convertBatch(
        items: Array<{ amount: number; from: string; to: string; date?: Date | string }>,
        targetCurrency: string
    ): Promise<Array<{ convertedAmount: number; exchangeRate: number }>> {
        if (items.length === 0) return [];

        // 1. Collect all unique dates
        const uniqueDates = [...new Set(items.map(i => this.formatDate(i.date || new Date())))];

        // 2. Pre-load all rates in parallel (populates cache)
        await Promise.all(uniqueDates.map(date => this.getRates(date)));

        // 3. Perform all conversions (will hit cache)
        return Promise.all(items.map(async item => {
            if (item.from === targetCurrency) {
                return { convertedAmount: item.amount, exchangeRate: 1 };
            }

            const converted = await this.convert(item.amount, item.from, targetCurrency, item.date);
            const rate = item.amount !== 0 ? converted / item.amount : 1;
            return { convertedAmount: converted, exchangeRate: rate };
        }));
    }
}
