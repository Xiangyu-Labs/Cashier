import { eq } from "drizzle-orm";
import { AppError, NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import { logger } from "@/lib/logger";

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }

  validatePassword(params.newPassword);

  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user) {
    throw new NotFoundError("User");
  }

  if (user.passwordHash == null) {
    throw new AppError("Current password is incorrect", AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG, 400);
  }

  const isCurrentValid = await verifyPassword(params.currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw new AppError("Current password is incorrect", AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG, 400);
  }

  const passwordHash = await hashPassword(params.newPassword);

  await db.update(users).set({ passwordHash }).where(eq(users.id, params.userId));

  logger.info({ userId: params.userId }, "Password changed successfully");
}
