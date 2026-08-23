import { roundToCurrency } from "@/lib/money/currency-precision";
import { convertWithRates } from "../services/rate-calculation";
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
  rates: Pick<FxRateBook, "getRates">
): Promise<ConvertEntryAmountResult> {
  const { amount, fromCurrency, toCurrency, date } = input;

  if (fromCurrency === toCurrency) {
    return {
      convertedAmount: roundToCurrency(amount, toCurrency),
      exchangeRate: "1",
    };
  }

  const snapshot = await rates.getRates(date != null && date !== "" ? date : undefined);
  return convertWithRates(amount, snapshot, fromCurrency, toCurrency);
}
