import Decimal from "decimal.js";
import { multiply, divide } from "@/lib/money/decimal";
import { AppError } from "@/lib/errors";
import type { ExchangeRates, FxRateBook } from "../ports";

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

  const rates = { ...ratesData.rates, [ratesData.base]: 1.0 };
  const fromRate = rates[item.fromCurrency];
  const toRate = rates[targetCurrency];

  if (fromRate === undefined || toRate === undefined) {
    throw new AppError(
      `Currency not found: ${fromRate === undefined ? item.fromCurrency : targetCurrency}`,
      "CURRENCY_NOT_FOUND"
    );
  }

  // Decimal arithmetic: Amount * (ToRate / FromRate)
  const rateRatio = divide(String(toRate), String(fromRate));
  const convertedAmount = multiply(item.amount, rateRatio);
  const exchangeRate = new Decimal(item.amount).isZero()
    ? "1"
    : new Decimal(convertedAmount).dividedBy(item.amount).toFixed();
  return {
    convertedAmount,
    exchangeRate,
  };
}

export async function convertAmountsBatch(
  items: CurrencyBatchConversionItem[],
  defaultTargetCurrency: string,
  rateBook: FxRateBook
): Promise<CurrencyBatchConversionResult[]> {
  if (items.length === 0) {
    return [];
  }

  const ratesByDate = await loadRatesByDate(items, rateBook);

  return items.map((item) => {
    const dateKey = getDateKey(item.date);
    const ratesData = ratesByDate.get(dateKey);
    if (ratesData == null) {
      throw new AppError(
        `Missing exchange rates for grouped date: ${dateKey}`,
        "MISSING_EXCHANGE_RATES"
      );
    }

    return resolveBatchItemConversion(item, item.toCurrency ?? defaultTargetCurrency, ratesData);
  });
}
