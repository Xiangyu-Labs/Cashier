import type { CurrencyBatchConversionResult } from "./application/use-cases/convert-amounts-batch";

export type { ConvertCurrencyResult } from "./application/use-cases/convert-currency";

export interface BatchConversionItem {
  amount: number;
  currency: string;
  date?: string;
}

export interface BatchConvertCurrencyResult {
  results: number[];
}

// Public adapter shape used by actions; application layer uses fromCurrency/toCurrency.
export interface BatchCurrencyConversionItem {
  amount: number;
  from: string;
  to: string;
  date?: string;
}

export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[];
