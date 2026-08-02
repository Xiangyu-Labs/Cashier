import type { CurrencyPort } from "@/application/contracts";

export async function recalculateEntriesConvertedAmount(
  ledgerId: string,
  mainCurrency: string,
  currencies: CurrencyPort
): Promise<void> {
  await currencies.recalculateLedger(ledgerId, mainCurrency);
}
