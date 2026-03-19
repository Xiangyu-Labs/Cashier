import { logger } from "@/lib/logger";
import { ExchangeRateService } from "./ExchangeRateService";

interface ConversionResult {
  convertedAmount: string;
  exchangeRate: string;
}

interface ConversionInput {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}

export class CurrencyService {
  static async convertEntryAmount(input: ConversionInput): Promise<ConversionResult | null> {
    const { amount, fromCurrency, toCurrency, date } = input;

    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount.toFixed(2),
        exchangeRate: "1",
      };
    }

    try {
      const converted = await ExchangeRateService.convert(amount, fromCurrency, toCurrency, date);

      return {
        convertedAmount: converted.toFixed(2),
        exchangeRate: (converted / amount).toFixed(6),
      };
    } catch (err) {
      logger.warn({ err, fromCurrency, toCurrency, date }, "Currency conversion failed");
      return null;
    }
  }

  static calculateExchangeRate(fromAmount: number, toAmount: number): string {
    return (toAmount / fromAmount).toFixed(6);
  }
}
