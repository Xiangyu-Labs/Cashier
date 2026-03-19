"use server";

import { parseDateString } from "@/lib/date-utils";
import { ExchangeRateService } from "./ExchangeRateService";

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

  const dateObj = date != null && date !== "" ? parseDateString(date) : undefined;
  const converted = await ExchangeRateService.convert(amount, from, to, dateObj);

  return { converted };
}

export interface BatchConversionItem {
  amount: number;
  currency: string;
  date?: string;
}

export interface BatchConvertCurrencyResult {
  results: number[];
}

export async function batchConvertCurrencyAction(
  items: BatchConversionItem[],
  targetCurrency: string
): Promise<BatchConvertCurrencyResult> {
  if (items.length === 0 || targetCurrency === "") {
    throw new Error("Missing required parameters");
  }

  const byDate = new Map<string, { indices: number[]; items: BatchConversionItem[] }>();
  items.forEach((item, index) => {
    const dateKey = item.date?.split("T")[0] ?? "today";
    const grouped = byDate.get(dateKey);
    if (grouped === undefined) {
      byDate.set(dateKey, { indices: [index], items: [item] });
      return;
    }

    grouped.indices.push(index);
    grouped.items.push(item);
  });

  const dateKeys = Array.from(byDate.keys());
  const ratesPromises = dateKeys.map(async (dateKey) => {
    const dateArg = dateKey === "today" ? undefined : dateKey;
    const rates = await ExchangeRateService.getRates(dateArg);
    return { dateKey, rates };
  });

  const ratesResults = await Promise.all(ratesPromises);
  const ratesMap = new Map(ratesResults.map((result) => [result.dateKey, result.rates]));
  const results: number[] = new Array(items.length);

  for (const [dateKey, group] of byDate) {
    const ratesData = ratesMap.get(dateKey);
    if (ratesData == null) {
      throw new Error(`Missing exchange rates for grouped date: ${dateKey}`);
    }

    const rates = { ...ratesData.rates, [ratesData.base]: 1.0 };

    for (const [index, item] of group.items.entries()) {
      const originalIndex = group.indices[index];
      if (originalIndex === undefined) {
        continue;
      }

      if (item.currency === targetCurrency || item.currency === "") {
        results[originalIndex] = item.amount;
        continue;
      }

      const fromRate = rates[item.currency];
      const toRate = rates[targetCurrency];

      if (fromRate === undefined || toRate === undefined) {
        results[originalIndex] = item.amount;
      } else {
        results[originalIndex] = item.amount * (toRate / fromRate);
      }
    }
  }

  return { results };
}
