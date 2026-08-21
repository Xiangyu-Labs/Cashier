import type { SupportedLocale } from "./locales";
import type { FEATURE_MESSAGES } from "./client-feature-messages";

export type FeatureMessageName = keyof typeof FEATURE_MESSAGES;

const FEATURE_MESSAGE_IMPORTS = {
  en: {
    shell: () => import("../../messages/en/shell.json"),
    stream: () => import("../../messages/en/stream.json"),
    details: () => import("../../messages/en/details.json"),
    stats: () => import("../../messages/en/stats.json"),
    settings: () => import("../../messages/en/settings.json"),
  },
  zh: {
    shell: () => import("../../messages/zh/shell.json"),
    stream: () => import("../../messages/zh/stream.json"),
    details: () => import("../../messages/zh/details.json"),
    stats: () => import("../../messages/zh/stats.json"),
    settings: () => import("../../messages/zh/settings.json"),
  },
} satisfies Record<
  SupportedLocale,
  Record<FeatureMessageName, () => Promise<{ default: Record<string, unknown> }>>
>;

export async function importFeatureMessages(
  locale: SupportedLocale,
  feature: FeatureMessageName
): Promise<Record<string, unknown>> {
  return (await FEATURE_MESSAGE_IMPORTS[locale][feature]()).default;
}
