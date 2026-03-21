import { logger } from "@/lib/logger";
import { CurrencyService } from "../services/currency";
import { ExchangeRateService } from "../services/exchange-rate";

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

export async function convertEntryAmount(
  input: ConvertEntryAmountInput
): Promise<ConvertEntryAmountResult | null> {
  const { amount, fromCurrency, toCurrency, date } = input;

  if (fromCurrency === toCurrency) {
    return {
      convertedAmount: amount.toFixed(2),
      exchangeRate: "1",
    };
  }

  try {
    const converted = await ExchangeRateService.convert(
      amount,
      fromCurrency,
      toCurrency,
      date != null && date !== "" ? date : undefined
    );

    return {
      convertedAmount: converted.toFixed(2),
      exchangeRate: CurrencyService.calculateExchangeRate(amount, converted),
    };
  } catch (err) {
    logger.warn({ err, fromCurrency, toCurrency, date }, "Currency conversion failed");
    return null;
  }
}
