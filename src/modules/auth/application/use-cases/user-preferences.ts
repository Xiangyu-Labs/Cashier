import { UnauthorizedError, ValidationError } from "@/lib/errors";
import type {
  UserPreferencesContract,
  UserPreferencesPort,
  UserInterfaceLanguage,
} from "@/application/contracts";

const INTERFACE_LANGUAGES = new Set<UserInterfaceLanguage>(["auto", "zh", "en"]);

function validatePreferences(input: UserPreferencesContract): UserPreferencesContract {
  if (!INTERFACE_LANGUAGES.has(input.interfaceLanguage)) {
    throw new ValidationError("Unsupported interface language");
  }
  return { interfaceLanguage: input.interfaceLanguage };
}

export async function updateUserPreferences(
  userId: string,
  input: UserPreferencesContract,
  preferences: UserPreferencesPort
): Promise<UserPreferencesContract> {
  const updated = await preferences.update({
    userId,
    preferences: validatePreferences(input),
  });
  if (updated == null) throw new UnauthorizedError();
  return updated;
}
