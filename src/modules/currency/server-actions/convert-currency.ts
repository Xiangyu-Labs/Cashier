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
import { withLedgerAccess } from "@/modules/ledger/access";
import { serverComposition } from "@/application/server-composition-root";

export const convertCurrencyAction = withLedgerAccess(
  async (
    _ledgerId: string,
    amount: number,
    from: string,
    to: string,
    date?: string
  ): Promise<ConvertCurrencyResult> =>
    convertCurrency(
      parseConvertCurrencyInput({
        amount,
        from,
        to,
        ...(date != null ? { date } : {}),
      }),
      serverComposition.exchangeRates
    )
);

export const batchConvertCurrencyAction = withLedgerAccess(
  async (
    _ledgerId: string,
    items: BatchConversionItem[],
    targetCurrency: string
  ): Promise<BatchConvertCurrencyResult> => {
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
      serverComposition.exchangeRates
    );

    return { results: results.map((item) => item.convertedAmount) };
  }
);
