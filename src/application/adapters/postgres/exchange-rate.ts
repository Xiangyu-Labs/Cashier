import { format } from "date-fns";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { currencyRates } from "@/persistence";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { dateStringSchema } from "@/lib/validation";
import type { FxRateBook } from "@/modules/currency/application/ports";
import { convertWithRates } from "@/modules/currency/application/services/rate-calculation";

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

const supportedCurrencySet = new Set<string>(SUPPORTED_CURRENCIES);

const providerCurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => supportedCurrencySet.has(code), "Unsupported currency code");

const providerRatesSchema = z.object({
  base: providerCurrencyCodeSchema,
  date: dateStringSchema,
  rates: z.record(providerCurrencyCodeSchema, z.number().finite().positive()),
});

/**
 * Validate a Frankfurter-style provider payload before anything is written.
 * Rejects malformed dates, unsupported currency codes, and non-finite or
 * non-positive rates without touching the database.
 */
function parseProviderRates(data: unknown): ExchangeRates {
  const result = providerRatesSchema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      "Invalid exchange-rate provider response",
      "EXCHANGE_RATES_INVALID_RESPONSE",
      502
    );
  }
  return result.data;
}

// helpers
export function formatExchangeRateDate(date: Date | string): string {
  if (typeof date === "string") {
    const [datePart] = date.split("T");
    return datePart ?? date;
  }

  return format(date, "yyyy-MM-dd");
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Fetch with a fixed retry budget (default 3 attempts): network failures,
 * HTTP 408, 429, and 5xx are retried with exponential backoff (1s, 2s);
 * other 4xx responses are returned immediately so the caller can handle them.
 * Every request keeps a 5000ms timeout.
 */
export async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  let lastError: unknown = new AppError(
    "Failed to fetch exchange rates",
    "EXCHANGE_RATES_FETCH_FAILED"
  );

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok || !isRetryableHttpStatus(response.status)) {
        return response;
      }
      lastError = new AppError(
        `Failed to fetch exchange rates: HTTP ${response.status}`,
        "EXCHANGE_RATES_FETCH_FAILED"
      );
    } catch (err) {
      lastError = err;
    }
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }

  throw lastError;
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

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AppError(
          "Invalid exchange-rate provider response",
          "EXCHANGE_RATES_INVALID_RESPONSE",
          502
        );
      }
      const data = parseProviderRates(payload);

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
        // Fire-and-forget: the rates query must not wait for ledger
        // recalculation work triggered by the stored event.
        void this.notifyRatesStored({
          date: targetDateStr,
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
    return convertWithRates(amount, ratesData, fromCurrency, toCurrency).convertedAmount;
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

    // 1. Same-currency items never touch the database or provider.
    const crossCurrencyItems = items.filter((item) => item.from !== targetCurrency);

    // 2. Collect all unique dates for cross-currency items only.
    const uniqueDates = [
      ...new Set(crossCurrencyItems.map((item) => formatExchangeRateDate(item.date ?? new Date()))),
    ];

    // 3. Pre-load one rates snapshot per date (M DB queries for M dates).
    const ratesByDate = new Map<string, ExchangeRates>();
    await Promise.all(
      uniqueDates.map(async (date) => {
        ratesByDate.set(date, await this.getRates(date));
      })
    );

    // 4. Map results synchronously using the pre-loaded snapshots.
    return items.map((item) => {
      if (item.from === targetCurrency) {
        return { convertedAmount: item.amount, exchangeRate: "1" };
      }

      const dateKey = formatExchangeRateDate(item.date ?? new Date());
      const ratesData = ratesByDate.get(dateKey);
      if (ratesData == null) {
        throw new AppError(
          `Missing exchange rates for grouped date: ${dateKey}`,
          "MISSING_EXCHANGE_RATES"
        );
      }
      return convertWithRates(item.amount, ratesData, item.from, targetCurrency);
    });
  }
}

export const postgresFxRateBook: FxRateBook = {
  getRates: (date) => ExchangeRateService.getRates(date),
  convert: (amount, fromCurrency, toCurrency, date) =>
    ExchangeRateService.convert(amount, fromCurrency, toCurrency, date),
  convertBatch: (items, targetCurrency) => ExchangeRateService.convertBatch(items, targetCurrency),
  registerRatesStoredHandler: (handler) => ExchangeRateService.registerRatesStoredHandler(handler),
};
