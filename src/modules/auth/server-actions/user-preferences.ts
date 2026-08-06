"use server";

import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";
import type { UserPreferences } from "@/modules/auth/contracts";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/modules/auth/application/use-cases/user-preferences";
import { serverComposition } from "@/application/server-composition-root";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.id == null || session.user.id === "") throw new UnauthorizedError();
  return session.user.id;
}

export async function getUserPreferencesAction(): Promise<UserPreferences> {
  const userId = await requireUserId();
  return getUserPreferences(userId, serverComposition.userPreferences);
}

export async function updateUserPreferencesAction(
  input: UserPreferences
): Promise<UserPreferences> {
  const userId = await requireUserId();
  return updateUserPreferences(userId, input, serverComposition.userPreferences);
}
