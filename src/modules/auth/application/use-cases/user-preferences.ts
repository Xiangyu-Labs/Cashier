import { UnauthorizedError } from "@/lib/errors";
import type { UserPreferencesContract, UserPreferencesPort } from "@/application/contracts";

export async function updateUserPreferences(
  userId: string,
  input: UserPreferencesContract,
  preferences: UserPreferencesPort
): Promise<UserPreferencesContract> {
  const updated = await preferences.update({
    userId,
    preferences: input,
  });
  if (updated == null) throw new UnauthorizedError();
  return updated;
}
