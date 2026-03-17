"use server";

import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";

export interface ConvertCurrencyResult {
  converted: number;
}

export async function convertCurrencyAction(
  amount: number,
  from: string,
  to: string,
  date?: string
): Promise<ConvertCurrencyResult> {
  if (amount === 0 || from === "" || to === "") {
    throw new Error("Missing required parameters");
  }

  const dateObj = date != null && date !== "" ? new Date(date) : undefined;
  const converted = await ExchangeRateService.convert(amount, from, to, dateObj);

  return { converted };
}

// Batch conversion types
export interface BatchConversionItem {
  amount: number;
  currency: string;
  date?: string;
}

export interface BatchConvertCurrencyResult {
  results: number[];
}

/**
 * Batch convert multiple amounts to a target currency.
 * Optimizes by grouping items by date to minimize rate lookups.
 */
export async function batchConvertCurrencyAction(
  items: BatchConversionItem[],
  targetCurrency: string
): Promise<BatchConvertCurrencyResult> {
  if (items.length === 0 || targetCurrency === "") {
    throw new Error("Missing required parameters");
  }

  // Group items by date to batch rate lookups
  const byDate = new Map<string, { indices: number[]; items: BatchConversionItem[] }>();
  items.forEach((item, index) => {
    const dateKey = item.date?.split("T")[0] ?? "today";
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { indices: [], items: [] });
    }
    byDate.get(dateKey)!.indices.push(index);
    byDate.get(dateKey)!.items.push(item);
  });

  // Pre-fetch rates for all unique dates in parallel
  const dateKeys = Array.from(byDate.keys());
  const ratesPromises = dateKeys.map(async (dateKey) => {
    const dateArg = dateKey === "today" ? undefined : dateKey;
    const rates = await ExchangeRateService.getRates(dateArg);
    return { dateKey, rates };
  });

  const ratesResults = await Promise.all(ratesPromises);
  const ratesMap = new Map(ratesResults.map((r) => [r.dateKey, r.rates]));

  // Convert all items using cached rates
  const results: number[] = new Array(items.length);

  for (const [dateKey, group] of byDate) {
    const ratesData = ratesMap.get(dateKey)!;
    const rates = { ...ratesData.rates, [ratesData.base]: 1.0 };

    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      const originalIndex = group.indices[i];

      if (item.currency === targetCurrency || item.currency === "") {
        results[originalIndex] = item.amount;
        continue;
      }

      const fromRate = rates[item.currency];
      const toRate = rates[targetCurrency];

      if (fromRate === undefined || toRate === undefined) {
        // Fallback: return original amount if conversion not possible
        results[originalIndex] = item.amount;
      } else {
        results[originalIndex] = item.amount * (toRate / fromRate);
      }
    }
  }

  return { results };
}
