import { convertCurrencyAction, type ConvertCurrencyResult } from "./actions";

export type { ConvertCurrencyResult };

export async function convertCurrencyForClient(
  amount: number,
  from: string,
  to: string,
  date?: string
): Promise<ConvertCurrencyResult> {
  return convertCurrencyAction(amount, from, to, date);
}
