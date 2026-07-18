import { divide, round } from "@/lib/money/decimal";

export class CurrencyService {
  static calculateExchangeRate(fromAmount: number, toAmount: number): string {
    return round(divide(String(toAmount), String(fromAmount)), 6);
  }
}
