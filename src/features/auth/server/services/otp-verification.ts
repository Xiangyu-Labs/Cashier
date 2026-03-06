"use server";

import { db } from "@/lib/db";
import { otpTokens } from "@/features/auth/server/schema";
import { eq } from "drizzle-orm";
import { verifyOTP, getMaxAttempts, getLockoutExpiration } from "./otp";
import { logger } from "@/lib/logger";
import type { InferSelectModel } from "drizzle-orm";

// Re-export OTP record type
type OTPRecord = InferSelectModel<typeof otpTokens>;

export interface VerificationResult {
  success: boolean;
  reason?: "not_found" | "expired" | "locked" | "invalid" | "max_attempts";
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

/**
 * Find OTP record by email (exported for use in verification flow)
 */
export async function findOTPRecord(email: string): Promise<OTPRecord | undefined> {
  const normalizedEmail = email.toLowerCase();
  const [record] = await db
    .select()
    .from(otpTokens)
    .where(eq(otpTokens.email, normalizedEmail))
    .limit(1);
  return record;
}

/**
 * Check if account is locked based on record
 */
function checkAccountLocked(record: OTPRecord): boolean {
  return record.lockedUntil ? record.lockedUntil > new Date() : false;
}

/**
 * Check if OTP has expired
 */
function isOTPExpired(record: OTPRecord): boolean {
  return record.expires < new Date();
}

/**
 * Handle failed verification - increment attempts and lock if necessary
 */
async function handleFailedVerification(
  email: string,
  currentAttempts: number
): Promise<VerificationResult> {
  const normalizedEmail = email.toLowerCase();
  const newAttempts = currentAttempts + 1;
  const maxAttempts = getMaxAttempts();

  if (newAttempts >= maxAttempts) {
    const lockedUntil = getLockoutExpiration();
    await db
      .update(otpTokens)
      .set({
        attempts: newAttempts,
        lastAttemptAt: new Date(),
        lockedUntil,
      })
      .where(eq(otpTokens.email, normalizedEmail));

    logger.warn(
      { email: normalizedEmail, attempts: newAttempts, lockedUntil },
      "Account locked due to too many failed attempts"
    );

    return {
      success: false,
      reason: "max_attempts",
      attemptsRemaining: 0,
      lockedUntil,
    };
  }

  await db
    .update(otpTokens)
    .set({
      attempts: newAttempts,
      lastAttemptAt: new Date(),
    })
    .where(eq(otpTokens.email, normalizedEmail));

  logger.warn(
    { email: normalizedEmail, attempts: newAttempts },
    "Invalid OTP provided"
  );

  return {
    success: false,
    reason: "invalid",
    attemptsRemaining: maxAttempts - newAttempts,
  };
}

/**
 * Mark OTP as verified
 */
async function markOTPAsVerified(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await db
    .update(otpTokens)
    .set({ verifiedAt: new Date() })
    .where(eq(otpTokens.email, normalizedEmail));
}

/**
 * Verify an OTP token with business logic
 * This function encapsulates the verification policy including:
 * - Account locking strategy
 * - Expiration checking
 * - Attempt counting
 */
export async function verifyOTPWithPolicy(
  email: string,
  otp: string,
  record: OTPRecord
): Promise<VerificationResult> {
  // 1. Check if account is locked
  if (checkAccountLocked(record)) {
    logger.warn({ email, lockedUntil: record.lockedUntil }, "Account is locked");
    return {
      success: false,
      reason: "locked",
      lockedUntil: record.lockedUntil ?? undefined,
    };
  }

  // 2. Check if OTP has expired
  if (isOTPExpired(record)) {
    logger.warn({ email }, "OTP has expired");
    return { success: false, reason: "expired" };
  }

  // 3. Verify the OTP
  const isValid = verifyOTP(otp, record.tokenHash);

  if (!isValid) {
    return await handleFailedVerification(email, record.attempts);
  }

  // 4. Mark as verified
  await markOTPAsVerified(email);
  logger.info({ email }, "OTP verified successfully");

  return { success: true };
}

/**
 * Check if an account is locked (public API)
 */
export async function isAccountLocked(email: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
}> {
  try {
    const record = await findOTPRecord(email);

    if (!record || !record.lockedUntil) {
      return { locked: false };
    }

    if (record.lockedUntil > new Date()) {
      return { locked: true, lockedUntil: record.lockedUntil };
    }

    return { locked: false };
  } catch (error) {
    logger.error({ error, email }, "Failed to check account lock status");
    return { locked: false };
  }
}
