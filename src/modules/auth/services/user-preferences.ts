import { logger } from "@/lib/logger";
import type { UserPreferencesContract } from "@/application/contracts";

const INTERFACE_LANGUAGES = new Set(["auto", "zh", "en"]);
const DEFAULT_PREFERENCES: UserPreferencesContract = { interfaceLanguage: "auto" };

export function normalizeUserPreferences(input: unknown): UserPreferencesContract {
  if (
    typeof input === "object" &&
    input != null &&
    Object.keys(input).length === 1 &&
    "interfaceLanguage" in input &&
    typeof input.interfaceLanguage === "string" &&
    INTERFACE_LANGUAGES.has(input.interfaceLanguage)
  ) {
    return { interfaceLanguage: input.interfaceLanguage as "auto" | "zh" | "en" };
  }
  logger.warn("Invalid persisted user preferences; using defaults");
  return DEFAULT_PREFERENCES;
}
