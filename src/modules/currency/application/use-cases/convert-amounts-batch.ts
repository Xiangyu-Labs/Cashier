import { AppError } from "@/lib/errors";
import type { ExchangeRates, FxRateBook } from "../ports";
import { convertWithRates } from "../services/rate-calculation";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

const MAX_CONCURRENT_RATE_LOOKUPS = 8;
const supportedCurrencySet = new Set<string>(SUPPORTED_CURRENCIES);

export interface CurrencyBatchConversionItem {
  amount: string;
  fromCurrency: string;
  toCurrency?: string;
  date?: string;
}

export interface CurrencyBatchConversionResult {
  convertedAmount: string;
  exchangeRate: string;
}

function getDateKey(date?: string): string {
  const dateKey = date?.split("T")[0];
  return dateKey ?? "today";
}

async function loadRatesByDate(
  items: CurrencyBatchConversionItem[],
  rateBook: Pick<FxRateBook, "getRates">
): Promise<Map<string, ExchangeRates>> {
  const uniqueDateKeys = [...new Set(items.map((item) => getDateKey(item.date)))];
  const ratesByDate = new Map<string, ExchangeRates>();
  let nextIndex = 0;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (firstError == null) {
      const index = nextIndex++;
      const dateKey = uniqueDateKeys[index];
      if (dateKey == null) return;
      const dateArg = dateKey === "today" ? undefined : dateKey;
      try {
        ratesByDate.set(dateKey, await rateBook.getRates(dateArg));
      } catch (error) {
        firstError ??= error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_RATE_LOOKUPS, uniqueDateKeys.length) }, worker)
  );
  if (firstError != null) throw firstError;

  return ratesByDate;
}

export async function convertAmountsBatch(
  items: CurrencyBatchConversionItem[],
  defaultTargetCurrency: string,
  rateBook: Pick<FxRateBook, "getRates">
): Promise<CurrencyBatchConversionResult[]> {
  if (items.length === 0) {
    return [];
  }

  // Only items that actually cross currencies need rate data; same-currency
  // items must not touch the database or the external provider.
  const crossCurrencyItems = items.filter(
    (item) => item.fromCurrency !== (item.toCurrency ?? defaultTargetCurrency)
  );
  const ratesByDate = await loadRatesByDate(crossCurrencyItems, rateBook);

  return items.map((item) => {
    const targetCurrency = item.toCurrency ?? defaultTargetCurrency;
    if (item.fromCurrency === targetCurrency) {
      if (!supportedCurrencySet.has(targetCurrency)) {
        throw new AppError(`Currency not found: ${targetCurrency}`, "CURRENCY_NOT_FOUND", 400);
      }
      return {
        convertedAmount: roundToCurrency(item.amount, targetCurrency),
        exchangeRate: "1",
      };
    }

    const dateKey = getDateKey(item.date);
    const ratesData = ratesByDate.get(dateKey);
    if (ratesData == null) {
      throw new AppError(
        `Missing exchange rates for grouped date: ${dateKey}`,
        "MISSING_EXCHANGE_RATES"
      );
    }

    return convertWithRates(item.amount, ratesData, item.fromCurrency, targetCurrency);
  });
}
