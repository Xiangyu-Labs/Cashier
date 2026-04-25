import { eq } from "drizzle-orm";
import { AppError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import { logger } from "@/lib/logger";

export async function setPassword(params: {
  userId: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }

  validatePassword(params.newPassword);

  const passwordHash = await hashPassword(params.newPassword);

  await db.update(users).set({ passwordHash }).where(eq(users.id, params.userId));

  logger.info({ userId: params.userId }, "Password set successfully");
}
