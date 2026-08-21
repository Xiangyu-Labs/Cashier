import { divide, round } from "@/lib/money/decimal";

export class CurrencyService {
  static calculateExchangeRate(fromAmount: string, toAmount: string): string {
    return round(divide(toAmount, fromAmount), 12);
  }
}
