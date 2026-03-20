export class CurrencyService {
  static calculateExchangeRate(fromAmount: number, toAmount: number): string {
    return (toAmount / fromAmount).toFixed(6);
  }
}
