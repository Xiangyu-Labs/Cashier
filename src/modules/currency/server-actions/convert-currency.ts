"use server";
import { ValidationError } from "@/lib/errors";
import { convertAmountsBatch } from "../application/use-cases/convert-amounts-batch";
import { convertCurrency } from "../application/use-cases/convert-currency";
import { parseConvertCurrencyInput } from "../contract-schemas";
import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  ConvertCurrencyResult,
} from "../contracts";

export async function convertCurrencyAction(
  amount: number,
  from: string,
  to: string,
  date?: string
): Promise<ConvertCurrencyResult> {
  return convertCurrency(
    parseConvertCurrencyInput({
      amount,
      from,
      to,
      ...(date != null ? { date } : {}),
    })
  );
}

export async function batchConvertCurrencyAction(
  items: BatchConversionItem[],
  targetCurrency: string
): Promise<BatchConvertCurrencyResult> {
  if (items.length === 0 || targetCurrency === "") {
    throw new ValidationError("Missing required parameters");
  }

  const results = await convertAmountsBatch(
    items.map((item) => ({
      amount: String(item.amount),
      fromCurrency: item.currency,
      toCurrency: targetCurrency,
      ...(item.date != null ? { date: item.date } : {}),
    })),
    targetCurrency,
    {
      allowBlankSourceCurrency: true,
      fallbackToOriginalAmountOnMissingRate: true,
    }
  );

  return { results: results.map((item) => item.convertedAmount) };
}
