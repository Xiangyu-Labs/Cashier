import type { ExchangeRatesStoredEvent, FxRateBook } from "./application/ports";

export type { ExchangeRatesStoredEvent } from "./application/ports";

export function registerExchangeRatesStoredHandler(
  handler: (event: ExchangeRatesStoredEvent) => void | Promise<void>,
  rateBook: FxRateBook
): () => void {
  return rateBook.registerRatesStoredHandler(handler);
}
