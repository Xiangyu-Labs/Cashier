"use server";
import type { OtpTokenContract, OtpTokenPort } from "@/application/contracts";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { getLockoutExpiration, getMaxAttempts } from "./otp";
import { verificationChallenges } from "./verification-challenge";

export interface VerificationResult {
  success: boolean;
  reason?: "not_found" | "expired" | "locked" | "invalid" | "max_attempts";
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

export interface ClaimedOTP {
  email: string;
  tokenHash: string;
}

export async function findOTPRecord(
  email: string,
  tokens: OtpTokenPort
): Promise<OtpTokenContract | undefined> {
  return (await tokens.find(email.toLowerCase())) ?? undefined;
}

export async function verifyOTPWithPolicy(
  email: string,
  otp: string,
  record: OtpTokenContract,
  tokens: OtpTokenPort
): Promise<VerificationResult> {
  const check = verificationChallenges.check(record, otp);
  if (!check.ok && check.reason === "locked") {
    return { success: false, reason: "locked", lockedUntil: check.lockedUntil };
  }
  if (!check.ok && check.reason === "expired") return { success: false, reason: "expired" };
  if (!check.ok) {
    const maxAttempts = getMaxAttempts();
    const failure = await tokens.recordFailure({
      email: email.toLowerCase(),
      tokenHash: record.tokenHash,
      maxAttempts,
      lockedUntil: getLockoutExpiration(),
    });
    if (failure == null) return { success: false, reason: "not_found" };
    if (failure.attempts >= maxAttempts) {
      return {
        success: false,
        reason: "max_attempts",
        attemptsRemaining: 0,
        ...(failure.lockedUntil == null ? {} : { lockedUntil: failure.lockedUntil }),
      };
    }
    return {
      success: false,
      reason: "invalid",
      attemptsRemaining: maxAttempts - failure.attempts,
    };
  }
  const claimed = await tokens.claim({
    email: email.toLowerCase(),
    tokenHash: record.tokenHash,
    now: new Date(),
    maxAttempts: getMaxAttempts(),
  });
  if (!claimed) return { success: false, reason: "not_found" };
  logger.info("OTP verified and claimed successfully");
  return { success: true };
}

export async function releaseOTPClaim(claim: ClaimedOTP, tokens: OtpTokenPort): Promise<void> {
  await tokens.release(claim);
}

export async function consumeOTPClaim(claim: ClaimedOTP, tokens: OtpTokenPort): Promise<boolean> {
  return tokens.consume(claim);
}

/** @testOnly Exported for lockout policy integration tests. */
export async function isAccountLocked(
  email: string,
  tokens: OtpTokenPort
): Promise<{ locked: boolean; lockedUntil?: Date }> {
  try {
    const record = await findOTPRecord(email, tokens);
    if (record?.lockedUntil == null || record.lockedUntil <= new Date()) return { locked: false };
    return { locked: true, lockedUntil: record.lockedUntil };
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("email", email) },
      "Failed to check account lock status"
    );
    return { locked: false };
  }
}
