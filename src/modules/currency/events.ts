import { ExchangeRateService, type ExchangeRatesStoredEvent } from "./ExchangeRateService";

export type { ExchangeRatesStoredEvent } from "./ExchangeRateService";

export function registerExchangeRatesStoredHandler(
  handler: (event: ExchangeRatesStoredEvent) => void | Promise<void>
): (() => void) | null {
  if (typeof ExchangeRateService.registerRatesStoredHandler !== "function") {
    return null;
  }

  return ExchangeRateService.registerRatesStoredHandler(handler);
}
