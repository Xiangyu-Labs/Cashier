import type { CurrencyPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function recalculateEntriesConvertedAmount(
  ledgerId: string,
  mainCurrency: string,
  currencies: CurrencyPort = currentApplication.currencies
): Promise<void> {
  await currencies.recalculateLedger(ledgerId, mainCurrency);
}
