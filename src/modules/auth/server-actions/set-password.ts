"use server";

import { withAuth } from "@/lib/auth-actions";
import { parsePasswordMutationInput } from "@/modules/auth/contract-schemas";
import { setPassword as setPasswordUseCase } from "@/modules/auth/application/use-cases/set-password";
import { serverComposition } from "@/application/server-composition-root";

export const setPasswordAction = withAuth(async (userId: string, input: unknown) => {
  const parsed = parsePasswordMutationInput(input);
  const passwordUpdatedAt = await setPasswordUseCase(
    { userId, newPassword: parsed.newPassword, confirmPassword: parsed.confirmPassword },
    serverComposition.accountSecurity
  );
  return { passwordUpdatedAt: passwordUpdatedAt.toISOString() };
});
