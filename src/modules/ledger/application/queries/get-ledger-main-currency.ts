import { currentApplication } from "@/application/current";

export async function getLedgerMainCurrency(ledgerId: string): Promise<string> {
  return (await currentApplication.settings.get(ledgerId))?.mainCurrency ?? "CNY";
}
