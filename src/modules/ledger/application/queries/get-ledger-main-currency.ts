import type { SettingsPort } from "@/application/contracts";

export async function getLedgerMainCurrency(
  ledgerId: string,
  settings: Pick<SettingsPort, "get">
): Promise<string> {
  return (await settings.get(ledgerId))?.mainCurrency ?? "CNY";
}
