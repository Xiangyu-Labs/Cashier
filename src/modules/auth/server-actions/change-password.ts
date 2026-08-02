"use server";

import { withAuth } from "@/lib/auth-actions";
import { parsePasswordMutationInput } from "@/modules/auth/contract-schemas";
import { changePassword as changePasswordUseCase } from "@/modules/auth/application/use-cases/change-password";
import { serverComposition } from "@/application/server-composition-root";

export const changePasswordAction = withAuth(async (userId: string, input: unknown) => {
  const parsed = parsePasswordMutationInput(input);
  const passwordUpdatedAt = await changePasswordUseCase(
    {
      userId,
      currentPassword: parsed.currentPassword ?? "",
      newPassword: parsed.newPassword,
      confirmPassword: parsed.confirmPassword,
    },
    serverComposition.accountSecurity
  );
  return { passwordUpdatedAt: passwordUpdatedAt.toISOString() };
});
