export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export type ExchangeRatesStoredEvent = ExchangeRates;
export type ExchangeRatesStoredHandler = (event: ExchangeRatesStoredEvent) => void | Promise<void>;

export interface FxRateBook {
  getRates(date?: Date | string): Promise<ExchangeRates>;
  convert(
    amount: string,
    fromCurrency: string,
    toCurrency: string,
    date?: Date | string
  ): Promise<string>;
  convertBatch(
    items: Array<{ amount: string; from: string; date?: Date | string }>,
    targetCurrency: string
  ): Promise<Array<{ convertedAmount: string; exchangeRate: string }>>;
  registerRatesStoredHandler(handler: ExchangeRatesStoredHandler): () => void;
}
