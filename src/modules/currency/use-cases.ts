import {
  convertAmountsBatch as convertAmountsBatchUseCase,
  type CurrencyBatchConversionResult,
} from "./application/use-cases/convert-amounts-batch";
import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
} from "./contracts";
export type { BatchConvertCurrencyResult } from "./contracts";
export {
  convertCurrency,
  type ConvertCurrencyInput,
  type ConvertCurrencyResult,
} from "./application/use-cases/convert-currency";
export {
  convertEntryAmount,
  type ConvertEntryAmountInput,
  type ConvertEntryAmountResult,
} from "./application/use-cases/convert-entry-amount";

export interface BatchCurrencyConversionItem {
  amount: number;
  from: string;
  to: string;
  date?: string;
}

export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[];

export async function convertAmountsBatch(
  items: BatchCurrencyConversionItem[],
  mainCurrency: string
): Promise<ConvertAmountsBatchResult> {
  return convertAmountsBatchUseCase(
    items.map((item) => ({
      amount: item.amount,
      fromCurrency: item.from,
      toCurrency: item.to,
      ...(item.date != null ? { date: item.date } : {}),
    })),
    mainCurrency
  );
}

export async function batchConvertCurrency(
  items: BatchConversionItem[],
  targetCurrency: string
): Promise<BatchConvertCurrencyResult> {
  if (items.length === 0 || targetCurrency === "") {
    throw new Error("Missing required parameters");
  }

  const results = await convertAmountsBatchUseCase(
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
