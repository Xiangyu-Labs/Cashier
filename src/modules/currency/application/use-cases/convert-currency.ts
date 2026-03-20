import { parseDateString } from "@/lib/date-utils";
import { ExchangeRateService } from "../../ExchangeRateService";

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
    throw new Error("Missing required parameters");
  }

  const converted = await ExchangeRateService.convert(
    input.amount,
    input.from,
    input.to,
    normalizeConversionDate(input.date)
  );

  return { converted };
}
