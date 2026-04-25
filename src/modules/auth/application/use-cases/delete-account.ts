import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users, otpTokens } from "@/persistence";
import { NotFoundError, AppError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyOTP } from "@/modules/auth/services/otp";
import { deleteOTPToken } from "@/modules/auth/repositories/otp-repository";
import { normalizeEmail } from "@/lib/utils/email";

export async function deleteAccount(params: {
  userId: string;
  email: string;
  otp: string;
}): Promise<void> {
  const normalizedEmail = normalizeEmail(params.email);

  const user = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user) {
    throw new NotFoundError("User");
  }

  const otpRecord = await db.query.otpTokens.findFirst({
    where: eq(otpTokens.email, normalizedEmail),
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

  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, params.userId));

  await deleteOTPToken(normalizedEmail);

  logger.info({ userId: params.userId }, "Account deleted successfully");
}
