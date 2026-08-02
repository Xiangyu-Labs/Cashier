import type { SettingsPort } from "@/application/contracts";

export async function getLedgerAiLanguage(
  ledgerId: string,
  settings: SettingsPort
): Promise<string> {
  const value = (await settings.get(ledgerId))?.aiLanguage;
  return value == null || value === "" ? "zh-CN" : value;
}
