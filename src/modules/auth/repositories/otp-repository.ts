import type { OtpTokenPort } from "@/application/contracts";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { getOTPExpiration, hashOTP } from "@/modules/auth/services/otp";

export async function createOTPToken(
  email: string,
  otp: string,
  tokens: OtpTokenPort,
  ipAddress?: string
): Promise<{ success: boolean; expiresAt: Date; tokenHash: string }> {
  const normalizedEmail = email.toLowerCase();
  const expiresAt = getOTPExpiration();
  const tokenHash = hashOTP(otp);
  await tokens.replace({
    email: normalizedEmail,
    tokenHash,
    expiresAt,
    ...(ipAddress === undefined ? {} : { ipAddress }),
  });
  logger.info({ subject: logIdentifier("email", normalizedEmail) }, "OTP token created");
  return { success: true, expiresAt, tokenHash };
}

export async function discardOTPToken(
  email: string,
  tokenHash: string,
  tokens: OtpTokenPort
): Promise<boolean> {
  const discarded = await tokens.discard({
    email: email.toLowerCase(),
    tokenHash,
  });
  if (discarded) {
    logger.info({ subject: logIdentifier("email", email) }, "OTP token discarded");
  }
  return discarded;
}

/** @testOnly Exported for OTP adapter contract tests. */
export async function deleteOTPToken(email: string, tokens: OtpTokenPort): Promise<void> {
  await tokens.delete(email.toLowerCase());
  logger.info({ subject: logIdentifier("email", email) }, "OTP token deleted");
}

/** @testOnly Exported for OTP cleanup contract tests. */
export async function cleanupExpiredOTPTokens(tokens: OtpTokenPort): Promise<number> {
  const deletedCount = await tokens.cleanupExpired(new Date());
  logger.info({ deleted: deletedCount }, "Cleaned up expired OTP tokens");
  return deletedCount;
}
