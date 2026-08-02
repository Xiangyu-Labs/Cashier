import { parseDateString } from "@/lib/date-utils";
import type { FxRateBook } from "../ports";
import type { ConvertCurrencyInput } from "../../contract-schemas";

export type { ConvertCurrencyInput } from "../../contract-schemas";

export interface ConvertCurrencyResult {
  converted: string;
}

function normalizeConversionDate(date?: string): Date | undefined {
  return date != null && date !== "" ? parseDateString(date) : undefined;
}

export async function convertCurrency(
  input: ConvertCurrencyInput,
  rates: FxRateBook
): Promise<ConvertCurrencyResult> {
  const converted = await rates.convert(
    String(input.amount),
    input.from,
    input.to,
    normalizeConversionDate(input.date)
  );

  return { converted };
}
