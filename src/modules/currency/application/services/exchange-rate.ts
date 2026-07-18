import { currentApplication } from "@/application/current";
import { format } from "date-fns";

export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export type ExchangeRatesStoredEvent = ExchangeRates;
export type ExchangeRatesStoredHandler = (event: ExchangeRatesStoredEvent) => void | Promise<void>;

export class ExchangeRateService {
  static getRates(date?: Date | string): Promise<ExchangeRates> {
    return currentApplication.exchangeRates.getRates(date);
  }

  static registerRatesStoredHandler(handler: ExchangeRatesStoredHandler): () => void {
    return currentApplication.exchangeRates.registerRatesStoredHandler(handler);
  }

  static convert(
    amount: string,
    fromCurrency: string,
    toCurrency: string,
    date?: Date | string
  ): Promise<string> {
    return currentApplication.exchangeRates.convert(amount, fromCurrency, toCurrency, date);
  }

  static convertBatch(
    items: Array<{ amount: string; from: string; to: string; date?: Date | string }>,
    targetCurrency: string
  ): Promise<Array<{ convertedAmount: string; exchangeRate: string }>> {
    return currentApplication.exchangeRates.convertBatch(items, targetCurrency);
  }
}

export function formatExchangeRateDate(date: Date | string): string {
  if (typeof date === "string") return date.split("T")[0] ?? date;
  return format(date, "yyyy-MM-dd");
}

export function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  return currentApplication.fetchExchangeRatesWithRetry(url, retries, delay);
}
