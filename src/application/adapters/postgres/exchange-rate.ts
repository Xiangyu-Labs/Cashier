import Decimal from "decimal.js";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { currencyRates } from "@/persistence";
import { eq } from "drizzle-orm";

// Current exchange-rate cache and provider adapter.

// types
export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ExchangeRatesStoredEvent {
  date: string;
  base: string;
  rates: Record<string, number>;
}

export type ExchangeRatesStoredHandler = (event: ExchangeRatesStoredEvent) => void | Promise<void>;

// helpers
export function formatExchangeRateDate(date: Date | string): string {
  if (typeof date === "string") {
    const [datePart] = date.split("T");
    return datePart ?? date;
  }

  return format(date, "yyyy-MM-dd");
}

export async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (err) {
      if (i === retries - 1) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }

  throw new AppError("Unreachable", "UNREACHABLE_CODE_PATH");
}

// service
export class ExchangeRateService {
  private static readonly API_BASE_URL = "https://api.frankfurter.app";

  private static pendingRequests = new Map<string, Promise<ExchangeRates>>();
  private static ratesStoredHandlers = new Set<ExchangeRatesStoredHandler>();

  /**
   * Get rates for a specific date (defaults to today).
   * Uses "Daily Snapshot" strategy:
   * 1. Check DB for date.
   * 2. If missing, fetch from Frankfurter (base=EUR) and cache.
   * 3. Return rates.
   */
  static async getRates(date?: Date | string): Promise<ExchangeRates> {
    const targetDateStr = formatExchangeRateDate(date ?? new Date());

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

    // 2. Request Collapsing - atomic check-and-set to prevent race condition
    // Check for pending request first (fast path)
    let fetchPromise = this.pendingRequests.get(targetDateStr);

    if (fetchPromise === undefined) {
      // Create the fetch promise immediately, before any await
      // This ensures the pending request is registered atomically
      fetchPromise = this.fetchAndStore(targetDateStr);
      this.pendingRequests.set(targetDateStr, fetchPromise);
    }

    // All concurrent requests will wait on the same promise
    return fetchPromise;
  }

  /**
   * Register handler for the "new daily rates stored" event.
   * Returns an unsubscribe function.
   */
  static registerRatesStoredHandler(handler: ExchangeRatesStoredHandler): () => void {
    this.ratesStoredHandlers.add(handler);
    return () => {
      this.ratesStoredHandlers.delete(handler);
    };
  }

  /**
   * Fetch rates from API and store in database.
   * Extracted to a separate method to prevent race conditions.
   */
  private static async fetchAndStore(targetDateStr: string): Promise<ExchangeRates> {
    try {
      const response = await fetchWithRetry(`${this.API_BASE_URL}/${targetDateStr}?base=EUR`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new AppError(
            `Exchange rates unavailable for date: ${targetDateStr}`,
            "EXCHANGE_RATES_UNAVAILABLE"
          );
        }
        throw new AppError(
          `Failed to fetch exchange rates: ${response.statusText}`,
          "EXCHANGE_RATES_FETCH_FAILED"
        );
      }

      const data: ExchangeRates = await response.json();

      // Atomic Upsert: Avoid race conditions if another instance or request writes simultaneously
      const insertedRows = await db
        .insert(currencyRates)
        .values({
          date: targetDateStr,
          base: data.base,
          rates: data.rates,
        })
        .onConflictDoNothing()
        .returning({ date: currencyRates.date });

      if (insertedRows.length > 0) {
        await this.notifyRatesStored({
          date: data.date,
          base: data.base,
          rates: data.rates,
        });
      }

      return data;
    } finally {
      // Remove from pending map once finished (success or failure)
      this.pendingRequests.delete(targetDateStr);
    }
  }

  /**
   * Convert amount from one currency to another using specific date's rates.
   */
  static async convert(
    amount: string,
    fromCurrency: string,
    toCurrency: string,
    date?: Date | string
  ): Promise<string> {
    if (fromCurrency === toCurrency) return amount;

    const ratesData = await this.getRates(date);
    const rates = ratesData.rates;

    // Add base currency (EUR) to rates map for easy calculation if not present
    // (Frankfurter results usually exclude the base from 'rates' object)
    const fullRates = { ...rates, [ratesData.base]: 1 };

    const fromRate = fullRates[fromCurrency];
    const toRate = fullRates[toCurrency];

    if (fromRate === undefined) {
      throw new AppError(`Currency not found: ${fromCurrency}`, "CURRENCY_NOT_FOUND");
    }
    if (toRate === undefined) {
      throw new AppError(`Currency not found: ${toCurrency}`, "CURRENCY_NOT_FOUND");
    }

    // Cross-Rate Calculation using Decimal arithmetic:
    // Result = Amount * (ToRate / FromRate)
    const result = new Decimal(amount).times(toRate).dividedBy(fromRate);

    // Return canonical non-exponent string
    return result.toFixed();
  }

  private static async notifyRatesStored(event: ExchangeRatesStoredEvent): Promise<void> {
    if (this.ratesStoredHandlers.size === 0) {
      return;
    }

    const pendingHandlers = [...this.ratesStoredHandlers].map(async (handler) => {
      await handler(event);
    });

    await Promise.allSettled(pendingHandlers);
  }

  /**
   * Batch convert multiple amounts, optimizing DB queries by pre-loading rates.
   * For N items with M unique dates, this performs M DB queries instead of N.
   */
  static async convertBatch(
    items: Array<{ amount: string; from: string; to: string; date?: Date | string }>,
    targetCurrency: string
  ): Promise<Array<{ convertedAmount: string; exchangeRate: string }>> {
    if (items.length === 0) return [];

    // 1. Collect all unique dates
    const uniqueDates = [
      ...new Set(items.map((item) => formatExchangeRateDate(item.date ?? new Date()))),
    ];

    // 2. Pre-load all rates in parallel (populates cache)
    await Promise.all(uniqueDates.map((date) => this.getRates(date)));

    // 3. Perform all conversions (will hit cache)
    return Promise.all(
      items.map(async (item) => {
        if (item.from === targetCurrency) {
          return { convertedAmount: item.amount, exchangeRate: "1" };
        }

        const converted = await this.convert(item.amount, item.from, targetCurrency, item.date);
        const rate =
          new Decimal(item.amount).isZero() || new Decimal(item.amount).isNaN()
            ? "1"
            : new Decimal(converted).dividedBy(item.amount).toFixed();
        return { convertedAmount: converted, exchangeRate: rate };
      })
    );
  }
}
