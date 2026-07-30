"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { users } from "@/persistence";
import type { InterfaceLanguage, UserPreferences } from "@/modules/auth/contracts";

const INTERFACE_LANGUAGES = new Set<InterfaceLanguage>(["auto", "zh", "en"]);

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.id == null || session.user.id === "") throw new UnauthorizedError();
  return session.user.id;
}

export async function getUserPreferencesAction(): Promise<UserPreferences> {
  const userId = await requireUserId();
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { preferences: true },
  });
  if (row == null) throw new UnauthorizedError();
  return row.preferences;
}

export async function updateUserPreferencesAction(
  input: UserPreferences
): Promise<UserPreferences> {
  const userId = await requireUserId();
  if (!INTERFACE_LANGUAGES.has(input.interfaceLanguage)) {
    throw new ValidationError("Unsupported interface language");
  }
  const preferences: UserPreferences = { interfaceLanguage: input.interfaceLanguage };
  const updated = await db
    .update(users)
    .set({ preferences, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ preferences: users.preferences })
    .then((rows) => rows[0]);
  if (updated == null) throw new UnauthorizedError();
  return updated.preferences;
}
