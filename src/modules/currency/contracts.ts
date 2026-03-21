// Keep this file as the module boundary contract: it must not import/re-export
// application-layer types to avoid cross-layer coupling.
export interface ConvertCurrencyResult {
  converted: number;
}

export interface BatchConversionItem {
  amount: number;
  currency: string;
  date?: string;
}

export interface BatchConvertCurrencyResult {
  results: number[];
}
