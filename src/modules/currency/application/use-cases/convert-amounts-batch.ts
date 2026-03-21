import { AppError } from "@/lib/errors";
import { ExchangeRateService, type ExchangeRates } from "../services/exchange-rate";

export interface CurrencyBatchConversionItem {
  amount: number;
  fromCurrency: string;
  toCurrency?: string;
  date?: string;
}

export interface CurrencyBatchConversionResult {
  convertedAmount: number;
  exchangeRate: number;
}

export interface ConvertAmountsBatchOptions {
  allowBlankSourceCurrency?: boolean;
  fallbackToOriginalAmountOnMissingRate?: boolean;
}

function getDateKey(date?: string): string {
  const dateKey = date?.split("T")[0];
  return dateKey ?? "today";
}

async function loadRatesByDate(
  items: CurrencyBatchConversionItem[]
): Promise<Map<string, ExchangeRates>> {
  const uniqueDateKeys = [...new Set(items.map((item) => getDateKey(item.date)))];
  const ratesEntries = await Promise.all(
    uniqueDateKeys.map(async (dateKey) => {
      const dateArg = dateKey === "today" ? undefined : dateKey;
      const rates = await ExchangeRateService.getRates(dateArg);
      return [dateKey, rates] as const;
    })
  );

  return new Map(ratesEntries);
}

function resolveBatchItemConversion(
  item: CurrencyBatchConversionItem,
  targetCurrency: string,
  ratesData: ExchangeRates,
  options: ConvertAmountsBatchOptions
): CurrencyBatchConversionResult {
  if (item.fromCurrency === targetCurrency) {
    return {
      convertedAmount: item.amount,
      exchangeRate: 1,
    };
  }

  if (options.allowBlankSourceCurrency && item.fromCurrency === "") {
    return {
      convertedAmount: item.amount,
      exchangeRate: 1,
    };
  }

  const rates = { ...ratesData.rates, [ratesData.base]: 1.0 };
  const fromRate = rates[item.fromCurrency];
  const toRate = rates[targetCurrency];

  if (fromRate === undefined || toRate === undefined) {
    if (options.fallbackToOriginalAmountOnMissingRate) {
      return {
        convertedAmount: item.amount,
        exchangeRate: 1,
      };
    }

    throw new AppError(`Currency not found: ${fromRate === undefined ? item.fromCurrency : targetCurrency}`, "CURRENCY_NOT_FOUND");
  }

  const convertedAmount = item.amount * (toRate / fromRate);
  return {
    convertedAmount,
    exchangeRate: item.amount !== 0 ? convertedAmount / item.amount : 1,
  };
}

export async function convertAmountsBatch(
  items: CurrencyBatchConversionItem[],
  defaultTargetCurrency: string,
  options: ConvertAmountsBatchOptions = {}
): Promise<CurrencyBatchConversionResult[]> {
  if (items.length === 0) {
    return [];
  }

  const ratesByDate = await loadRatesByDate(items);

  return items.map((item) => {
    const dateKey = getDateKey(item.date);
    const ratesData = ratesByDate.get(dateKey);
    if (ratesData == null) {
      throw new AppError(`Missing exchange rates for grouped date: ${dateKey}`, "MISSING_EXCHANGE_RATES");
    }

    return resolveBatchItemConversion(
      item,
      item.toCurrency ?? defaultTargetCurrency,
      ratesData,
      options
    );
  });
}
