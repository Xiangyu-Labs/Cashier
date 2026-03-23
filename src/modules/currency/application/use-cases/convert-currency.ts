import { parseDateString } from "@/lib/date-utils";
import { ExchangeRateService } from "../services/exchange-rate";
import type { ConvertCurrencyInput } from "../../contract-schemas";

export type { ConvertCurrencyInput } from "../../contract-schemas";

export interface ConvertCurrencyResult {
  converted: number;
}

function normalizeConversionDate(date?: string): Date | undefined {
  return date != null && date !== "" ? parseDateString(date) : undefined;
}

export async function convertCurrency(input: ConvertCurrencyInput): Promise<ConvertCurrencyResult> {
  const converted = await ExchangeRateService.convert(
    input.amount,
    input.from,
    input.to,
    normalizeConversionDate(input.date)
  );

  return { converted };
}
