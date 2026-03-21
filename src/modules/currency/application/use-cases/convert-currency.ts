import { parseDateString } from "@/lib/date-utils";
import { ValidationError } from "@/lib/errors";
import { ExchangeRateService } from "../services/exchange-rate";

export interface ConvertCurrencyInput {
  amount: number;
  from: string;
  to: string;
  date?: string;
}

export interface ConvertCurrencyResult {
  converted: number;
}

function normalizeConversionDate(date?: string): Date | undefined {
  return date != null && date !== "" ? parseDateString(date) : undefined;
}

export async function convertCurrency(
  input: ConvertCurrencyInput
): Promise<ConvertCurrencyResult> {
  if (input.amount === 0 || input.from === "" || input.to === "") {
    throw new ValidationError("Missing required parameters");
  }

  const converted = await ExchangeRateService.convert(
    input.amount,
    input.from,
    input.to,
    normalizeConversionDate(input.date)
  );

  return { converted };
}
