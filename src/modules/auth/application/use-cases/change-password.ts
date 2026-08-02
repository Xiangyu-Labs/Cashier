import { AppError, NotFoundError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import type { AccountSecurityPort } from "../ports";

export async function changePassword(
  params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  accounts: AccountSecurityPort
): Promise<Date> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }
  validatePassword(params.newPassword);

  const currentPasswordHash = await accounts.getPasswordHash(params.userId);
  if (currentPasswordHash === undefined) throw new NotFoundError("User");
  if (
    currentPasswordHash == null ||
    !(await verifyPassword(params.currentPassword, currentPasswordHash))
  ) {
    throw new AppError(
      "Current password is incorrect",
      AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
      400
    );
  }

  const passwordHash = await hashPassword(params.newPassword);
  const passwordUpdatedAt = new Date();
  const changed = await accounts.changePassword({
    userId: params.userId,
    expectedPasswordHash: currentPasswordHash,
    passwordHash,
    passwordUpdatedAt,
  });
  if (!changed) throw new AppError("Password changed concurrently", "CONFLICT", 409);
  return passwordUpdatedAt;
}
