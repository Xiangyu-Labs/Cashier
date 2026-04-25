import { eq } from "drizzle-orm";
import { AppError, NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users, otpTokens } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyOTP } from "@/modules/auth/services/otp";
import { deleteOTPToken } from "@/modules/auth/repositories/otp-repository";
import { normalizeEmail } from "@/lib/utils/email";
import { logger } from "@/lib/logger";

export async function changeEmail(params: {
  userId: string;
  newEmail: string;
  otp: string;
}): Promise<void> {
  const normalizedNewEmail = normalizeEmail(params.newEmail);

  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user) {
    throw new NotFoundError("User");
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, normalizedNewEmail),
  });
  if (existingUser && existingUser.id !== params.userId) {
    throw new AppError("Email already in use", AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS, 400);
  }

  const otpRecord = await db.query.otpTokens.findFirst({
    where: eq(otpTokens.email, normalizedNewEmail),
  });
  if (!otpRecord) {
    throw new AppError("Invalid OTP", AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION, 400);
  }

  if (otpRecord.expires.getTime() < Date.now()) {
    throw new AppError("OTP has expired", AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION, 400);
  }

  const isValid = verifyOTP(params.otp, otpRecord.tokenHash);
  if (!isValid) {
    throw new AppError("Invalid OTP", AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION, 400);
  }

  await db.update(users).set({ email: normalizedNewEmail }).where(eq(users.id, params.userId));

  await deleteOTPToken(normalizedNewEmail);

  logger.info({ userId: params.userId, newEmail: normalizedNewEmail }, "Email changed successfully");
}
