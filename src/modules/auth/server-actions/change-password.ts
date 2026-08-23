"use server";

import { withAuth } from "@/lib/auth-actions";
import { parsePasswordMutationInput } from "@/modules/auth/contract-schemas";
import { changePassword as changePasswordUseCase } from "@/modules/auth/application/use-cases/change-password";
import { serverComposition } from "@/application/server-composition-root";
import { logError } from "@/lib/error-handlers";
import type { PasswordMutationActionResult } from "@/modules/auth/contracts";
import { toPasswordMutationActionErrorCode } from "./password-action-result";

export const changePasswordAction = withAuth(
  async (userId: string, input: unknown): Promise<PasswordMutationActionResult> => {
    try {
      const parsed = parsePasswordMutationInput(input);
      const passwordUpdatedAt = await changePasswordUseCase(
        {
          userId,
          currentPassword: parsed.currentPassword ?? "",
          newPassword: parsed.newPassword,
          confirmPassword: parsed.confirmPassword,
        },
        {
          accounts: serverComposition.accountSecurity,
          rateLimiter: serverComposition.rateLimiter,
        }
      );
      return { ok: true, passwordUpdatedAt: passwordUpdatedAt.toISOString() };
    } catch (error) {
      const code = toPasswordMutationActionErrorCode(error);
      if (code === "unexpected") logError("changePasswordAction", error);
      return { ok: false, code };
    }
  }
);
