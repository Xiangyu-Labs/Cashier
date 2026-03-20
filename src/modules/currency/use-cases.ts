import {
  convertAmountsBatch as convertAmountsBatchUseCase,
  type CurrencyBatchConversionResult,
} from "./application/use-cases/convert-amounts-batch";
export {
  convertEntryAmount,
  type ConvertEntryAmountInput,
  type ConvertEntryAmountResult,
} from "./application/use-cases/convert-entry-amount";

export interface BatchCurrencyConversionItem {
  amount: number;
  from: string;
  to: string;
  date?: string;
}

export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[];

export async function convertAmountsBatch(
  items: BatchCurrencyConversionItem[],
  mainCurrency: string
): Promise<ConvertAmountsBatchResult> {
  return convertAmountsBatchUseCase(
    items.map((item) => ({
      amount: item.amount,
      fromCurrency: item.from,
      toCurrency: item.to,
      ...(item.date != null ? { date: item.date } : {}),
    })),
    mainCurrency
  );
}
