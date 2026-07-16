import { currentApplication } from "@/application/current";

export async function getLedgerAiLanguage(ledgerId: string): Promise<string> {
  const value = (await currentApplication.settings.get(ledgerId))?.aiLanguage;
  return value == null || value === "" ? "zh-CN" : value;
}
