"use server";
import type { OtpTokenContract, OtpTokenPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { logger } from "@/lib/logger";
import { getLockoutExpiration, getMaxAttempts, verifyOTP } from "./otp";

export interface VerificationResult {
  success: boolean;
  reason?: "not_found" | "expired" | "locked" | "invalid" | "max_attempts";
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

export async function findOTPRecord(
  email: string,
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<OtpTokenContract | undefined> {
  return (await tokens.find(email.toLowerCase())) ?? undefined;
}

export async function verifyOTPWithPolicy(
  email: string,
  otp: string,
  record: OtpTokenContract,
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<VerificationResult> {
  if (record.lockedUntil != null && record.lockedUntil > new Date()) {
    return { success: false, reason: "locked", lockedUntil: record.lockedUntil };
  }
  if (record.expiresAt < new Date()) return { success: false, reason: "expired" };
  if (!verifyOTP(otp, record.tokenHash)) {
    const attempts = record.attempts + 1;
    const maxAttempts = getMaxAttempts();
    if (attempts >= maxAttempts) {
      const lockedUntil = getLockoutExpiration();
      await tokens.recordFailure({ email: email.toLowerCase(), attempts, lockedUntil });
      return { success: false, reason: "max_attempts", attemptsRemaining: 0, lockedUntil };
    }
    await tokens.recordFailure({ email: email.toLowerCase(), attempts });
    return { success: false, reason: "invalid", attemptsRemaining: maxAttempts - attempts };
  }
  await tokens.markVerified(email.toLowerCase());
  logger.info({ email }, "OTP verified successfully");
  return { success: true };
}

export async function isAccountLocked(
  email: string,
  tokens: OtpTokenPort = currentApplication.otpTokens
): Promise<{ locked: boolean; lockedUntil?: Date }> {
  try {
    const record = await findOTPRecord(email, tokens);
    if (record?.lockedUntil == null || record.lockedUntil <= new Date()) return { locked: false };
    return { locked: true, lockedUntil: record.lockedUntil };
  } catch (error) {
    logger.error({ error, email }, "Failed to check account lock status");
    return { locked: false };
  }
}
