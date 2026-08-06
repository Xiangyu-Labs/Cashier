import { AppError } from "@/lib/errors";
import type { ExchangeRates, FxRateBook } from "../ports";
import { convertWithRates } from "../services/rate-calculation";

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
  rateBook: FxRateBook
): Promise<Map<string, ExchangeRates>> {
  const uniqueDateKeys = [...new Set(items.map((item) => getDateKey(item.date)))];
  const ratesEntries = await Promise.all(
    uniqueDateKeys.map(async (dateKey) => {
      const dateArg = dateKey === "today" ? undefined : dateKey;
      const rates = await rateBook.getRates(dateArg);
      return [dateKey, rates] as const;
    })
  );

  return new Map(ratesEntries);
}

function resolveBatchItemConversion(
  item: CurrencyBatchConversionItem,
  targetCurrency: string,
  ratesData: ExchangeRates
): CurrencyBatchConversionResult {
  if (item.fromCurrency === targetCurrency) {
    return {
      convertedAmount: item.amount,
      exchangeRate: "1",
    };
  }

  return convertWithRates(item.amount, ratesData, item.fromCurrency, targetCurrency);
}

export async function convertAmountsBatch(
  items: CurrencyBatchConversionItem[],
  defaultTargetCurrency: string,
  rateBook: FxRateBook
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
      return {
        convertedAmount: item.amount,
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

    return resolveBatchItemConversion(item, targetCurrency, ratesData);
  });
}
