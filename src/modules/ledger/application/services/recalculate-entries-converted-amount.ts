import type { CurrencyPort } from "@/application/contracts";

export async function recalculateEntriesConvertedAmount(
  ledgerId: string,
  mainCurrency: string,
  currencies: CurrencyPort
): Promise<void> {
  await currencies.recalculateLedger(ledgerId, mainCurrency);
}

export async function recalculateEntriesConvertedAmountForDate(
  ledgerId: string,
  date: string,
  currencies: CurrencyPort
): Promise<void> {
  await currencies.recalculateLedgerForDate(ledgerId, date);
}
