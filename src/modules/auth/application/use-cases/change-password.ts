import { and, eq, isNull } from "drizzle-orm";
import { AppError, NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<Date> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }
  validatePassword(params.newPassword);

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, params.userId), isNull(users.deletedAt)),
  });
  if (user == null) throw new NotFoundError("User");
  if (
    user.passwordHash == null ||
    !(await verifyPassword(params.currentPassword, user.passwordHash))
  ) {
    throw new AppError(
      "Current password is incorrect",
      AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
      400
    );
  }

  const passwordHash = await hashPassword(params.newPassword);
  const passwordUpdatedAt = new Date();
  await db
    .update(users)
    .set({ passwordHash, passwordUpdatedAt, updatedAt: passwordUpdatedAt })
    .where(eq(users.id, params.userId));
  return passwordUpdatedAt;
}
