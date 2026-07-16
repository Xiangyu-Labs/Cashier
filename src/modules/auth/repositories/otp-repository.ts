import type { OtpTokenPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { logger } from "@/lib/logger";
import { getOTPExpiration, hashOTP } from "@/modules/auth/services/otp";

export async function createOTPToken(
  email: string,
  otp: string,
  ipAddress?: string,
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<{ success: boolean; expiresAt: Date }> {
  const normalizedEmail = email.toLowerCase();
  const expiresAt = getOTPExpiration();
  await tokens.replace({
    email: normalizedEmail,
    tokenHash: hashOTP(otp),
    expiresAt,
    ...(ipAddress === undefined ? {} : { ipAddress }),
  });
  logger.info({ email: normalizedEmail }, "OTP token created");
  return { success: true, expiresAt };
}

export async function deleteOTPToken(
  email: string,
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<void> {
  await tokens.delete(email.toLowerCase());
  logger.info({ email: email.toLowerCase() }, "OTP token deleted");
}

export async function cleanupExpiredOTPTokens(
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<number> {
  const deletedCount = await tokens.cleanupExpired(new Date());
  logger.info({ deleted: deletedCount }, "Cleaned up expired OTP tokens");
  return deletedCount;
}
