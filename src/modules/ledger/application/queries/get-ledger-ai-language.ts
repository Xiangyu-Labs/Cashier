import type { SettingsPort } from "@/application/contracts";

export async function getLedgerAiLanguage(
  ledgerId: string,
  settings: Pick<SettingsPort, "get">
): Promise<string> {
  const value = (await settings.get(ledgerId))?.aiLanguage;
  return value == null || value === "" ? "zh-CN" : value;
}
