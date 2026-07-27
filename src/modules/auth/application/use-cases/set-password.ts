import { and, eq, isNull } from "drizzle-orm";
import { AppError, NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";

export async function setPassword(params: {
  userId: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<Date> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }
  validatePassword(params.newPassword);

  const passwordHash = await hashPassword(params.newPassword);
  const passwordUpdatedAt = new Date();
  const updated = await db
    .update(users)
    .set({ passwordHash, passwordUpdatedAt, updatedAt: passwordUpdatedAt })
    .where(and(eq(users.id, params.userId), isNull(users.deletedAt), isNull(users.passwordHash)))
    .returning({ id: users.id });
  if (updated.length === 0) throw new NotFoundError("User without a password");
  return passwordUpdatedAt;
}
