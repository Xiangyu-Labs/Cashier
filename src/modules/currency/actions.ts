"use server";

import { convertAmountsBatch } from "./application/use-cases/convert-amounts-batch";
import { convertCurrency } from "./application/use-cases/convert-currency";

export interface ConvertCurrencyResult {
  converted: number;
}

export async function convertCurrencyAction(
  amount: number,
  from: string,
  to: string,
  date?: string
): Promise<ConvertCurrencyResult> {
  return convertCurrency({
    amount,
    from,
    to,
    ...(date != null ? { date } : {}),
  });
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

  const results = await convertAmountsBatch(
    items.map((item) => ({
      amount: item.amount,
      fromCurrency: item.currency,
      toCurrency: targetCurrency,
      ...(item.date != null ? { date: item.date } : {}),
    })),
    targetCurrency,
    {
      allowBlankSourceCurrency: true,
      fallbackToOriginalAmountOnMissingRate: true,
    }
  );

  return { results: results.map((item) => item.convertedAmount) };
}
