import type { OtpTokenPort } from "@/application/contracts";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { getOTPExpiration, hashOTP } from "@/modules/auth/services/otp";

export async function createOTPToken(
  email: string,
  otp: string,
  tokens: OtpTokenPort,
  ipAddress?: string
): Promise<{ success: boolean; expiresAt: Date }> {
  const normalizedEmail = email.toLowerCase();
  const expiresAt = getOTPExpiration();
  await tokens.replace({
    email: normalizedEmail,
    tokenHash: hashOTP(otp),
    expiresAt,
    ...(ipAddress === undefined ? {} : { ipAddress }),
  });
  logger.info({ subject: logIdentifier("email", normalizedEmail) }, "OTP token created");
  return { success: true, expiresAt };
}

export async function deleteOTPToken(email: string, tokens: OtpTokenPort): Promise<void> {
  await tokens.delete(email.toLowerCase());
  logger.info({ subject: logIdentifier("email", email) }, "OTP token deleted");
}

export async function cleanupExpiredOTPTokens(tokens: OtpTokenPort): Promise<number> {
  const deletedCount = await tokens.cleanupExpired(new Date());
  logger.info({ deleted: deletedCount }, "Cleaned up expired OTP tokens");
  return deletedCount;
}
