export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ExchangeRatesStoredEvent {
  date: string;
  base: string;
  rates: Record<string, number>;
}

export type ExchangeRatesStoredHandler = (
  event: ExchangeRatesStoredEvent
) => void | Promise<void>;
