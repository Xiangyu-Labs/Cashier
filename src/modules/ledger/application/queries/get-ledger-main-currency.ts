import type { SettingsPort } from "@/application/contracts";

export async function getLedgerMainCurrency(
  ledgerId: string,
  settings: SettingsPort
): Promise<string> {
  return (await settings.get(ledgerId))?.mainCurrency ?? "CNY";
}
