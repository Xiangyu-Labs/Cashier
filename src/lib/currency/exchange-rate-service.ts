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

        // 2. Fetch from API
        // We always fetch base=EUR to ensure consistency and minimize permutations.
        // Frankfurter returns historical rates for ALL supported currencies when no symbols specified.
        const response = await fetch(`${this.API_BASE_URL}/${targetDateStr}?base=EUR`);

        if (!response.ok) {
            if (response.status === 404) {
                // Handle future dates or invalid dates gracefully if needed, 
                // but Frankfurter usually handles dates well (maps to latest available working day).
                // However, strict 404 means data unavailable.
                throw new Error(`Exchange rates unavailable for date: ${targetDateStr}`);
            }
            throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
        }

        const data: ExchangeRates = await response.json();

        // 3. Store in DB
        // Note: Frankfurter might return a different date if the requested date is a holiday/weekend using 'latest' logic,
        // BUT specific date queries usually return that date or error? 
        // Actually Frankfurter 'latest' returns the last working day. 
        // Historical queries like '2023-01-01' (Sunday) usually return the closest previous working day (2022-12-30) inside the response 'date' field.
        // We should save it under the *response* date to maintain data integrity, 
        // but we might also want to map the *requested* date to this data to avoid re-fetching?
        // User Requirement: "if this day's data is missing... get other currency rates".
        // Let's stick to saving the date returned by Frankfurter to be safe.

        // Check if we already have this date (race condition check / duplicate check)
        const existing = await db.query.currencyRates.findFirst({
            where: eq(currencyRates.date, data.date),
        });

        if (!existing) {
            await db.insert(currencyRates).values({
                date: data.date,
                base: data.base,
                rates: data.rates,
            });
        }

        return data;
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
