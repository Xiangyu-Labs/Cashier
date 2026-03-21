export type { ConvertCurrencyResult } from "./application/use-cases/convert-currency";

export interface BatchConversionItem {
  amount: number;
  currency: string;
  date?: string;
}

export interface BatchConvertCurrencyResult {
  results: number[];
}
