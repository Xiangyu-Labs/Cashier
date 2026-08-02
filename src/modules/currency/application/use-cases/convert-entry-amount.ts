import { round } from "@/lib/money/decimal";
import { CurrencyService } from "../services/currency";
import type { FxRateBook } from "../ports";

export interface ConvertEntryAmountInput {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}

export interface ConvertEntryAmountResult {
  convertedAmount: string;
  exchangeRate: string;
}

export async function convertEntryAmount(
  input: ConvertEntryAmountInput,
  rates: FxRateBook
): Promise<ConvertEntryAmountResult> {
  const { amount, fromCurrency, toCurrency, date } = input;

  if (fromCurrency === toCurrency) {
    return {
      convertedAmount: round(amount, 2),
      exchangeRate: "1",
    };
  }

  const converted = await rates.convert(
    amount,
    fromCurrency,
    toCurrency,
    date != null && date !== "" ? date : undefined
  );

  return {
    convertedAmount: round(converted, 2),
    exchangeRate: CurrencyService.calculateExchangeRate(amount, converted),
  };
}
