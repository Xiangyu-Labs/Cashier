import { ExchangeRateService, type ExchangeRatesStoredEvent } from "./application/services/exchange-rate";

export type { ExchangeRatesStoredEvent } from "./application/services/exchange-rate";

export function registerExchangeRatesStoredHandler(
  handler: (event: ExchangeRatesStoredEvent) => void | Promise<void>
): (() => void) | null {
  if (typeof ExchangeRateService.registerRatesStoredHandler !== "function") {
    return null;
  }

  return ExchangeRateService.registerRatesStoredHandler(handler);
}
