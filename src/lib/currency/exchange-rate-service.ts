import { db } from "@/lib/db";
import { currencyRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";

export interface ExchangeRates {
    base: string;
    date: string;
    rates: Record<string, number>;
}

export class ExchangeRateService {
    private static readonly API_BASE_URL = "https://api.frankfurter.dev/v1";

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
                const response = await fetch(`${this.API_BASE_URL}/${targetDateStr}?base=EUR`);

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(`Exchange rates unavailable for date: ${targetDateStr}`);
                    }
                    throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
                }

                const data: ExchangeRates = await response.json();

                // Atomic Upsert: Avoid race conditions if another instance or request writes simultaneously
                await db.insert(currencyRates)
                    .values({
                        date: data.date,
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
}
