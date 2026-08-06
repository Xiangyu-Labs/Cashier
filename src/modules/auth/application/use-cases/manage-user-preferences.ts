import { UnauthorizedError, ValidationError } from "@/lib/errors";
import type { UserPreferences } from "../../contracts";
import type { UserPreferencesPort } from "../ports";

const INTERFACE_LANGUAGES = new Set<UserPreferences["interfaceLanguage"]>(["auto", "zh", "en"]);

export async function getUserPreferences(
  userId: string,
  preferences: UserPreferencesPort
): Promise<UserPreferences> {
  const result = await preferences.get(userId);
  if (result == null) throw new UnauthorizedError();
  return result;
}

export async function updateUserPreferences(
  userId: string,
  input: UserPreferences,
  preferences: UserPreferencesPort
): Promise<UserPreferences> {
  if (!INTERFACE_LANGUAGES.has(input.interfaceLanguage)) {
    throw new ValidationError("Unsupported interface language");
  }
  const result = await preferences.update(userId, {
    interfaceLanguage: input.interfaceLanguage,
  });
  if (result == null) throw new UnauthorizedError();
  return result;
}
