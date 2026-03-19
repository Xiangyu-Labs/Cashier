import { CurrencyService } from "./service";
import { ExchangeRateService } from "./ExchangeRateService";
import { initializeExchangeRateRecalculationOrchestration } from "./services/exchange-rate-callback";

initializeExchangeRateRecalculationOrchestration();

export interface ConvertEntryAmountInput {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}

export interface ConvertEntryAmountResult {
  convertedAmount: string;
  exchangeRate: string;
}

export interface BatchCurrencyConversionItem {
  amount: number;
  from: string;
  to: string;
  date: string | undefined;
}

export async function convertEntryAmount(
  input: ConvertEntryAmountInput
): Promise<ConvertEntryAmountResult | null> {
  return CurrencyService.convertEntryAmount(input);
}

export async function convertAmountsBatch(
  items: BatchCurrencyConversionItem[],
  mainCurrency: string
) {
  return ExchangeRateService.convertBatch(items, mainCurrency);
}
