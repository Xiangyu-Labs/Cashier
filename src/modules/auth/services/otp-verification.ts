"use server";

import { db } from "@/lib/db";
import { otpTokens } from "@/persistence/schema/auth";
import { eq } from "drizzle-orm";
import { verifyOTP, getMaxAttempts, getLockoutExpiration } from "./otp";
import { logger } from "@/lib/logger";
import type { InferSelectModel } from "drizzle-orm";

type OTPRecord = InferSelectModel<typeof otpTokens>;

export interface VerificationResult {
  success: boolean;
  reason?: "not_found" | "expired" | "locked" | "invalid" | "max_attempts";
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

export async function findOTPRecord(email: string): Promise<OTPRecord | undefined> {
  const normalizedEmail = email.toLowerCase();
  const [record] = await db
    .select()
    .from(otpTokens)
    .where(eq(otpTokens.email, normalizedEmail))
    .limit(1);
  return record;
}

function checkAccountLocked(record: OTPRecord): boolean {
  return record.lockedUntil ? record.lockedUntil > new Date() : false;
}

function isOTPExpired(record: OTPRecord): boolean {
  return record.expires < new Date();
}

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

  logger.warn({ email: normalizedEmail, attempts: newAttempts }, "Invalid OTP provided");

  return {
    success: false,
    reason: "invalid",
    attemptsRemaining: maxAttempts - newAttempts,
  };
}

async function markOTPAsVerified(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await db
    .update(otpTokens)
    .set({ verifiedAt: new Date() })
    .where(eq(otpTokens.email, normalizedEmail));
}

export async function verifyOTPWithPolicy(
  email: string,
  otp: string,
  record: OTPRecord
): Promise<VerificationResult> {
  if (checkAccountLocked(record)) {
    logger.warn({ email, lockedUntil: record.lockedUntil }, "Account is locked");
    return {
      success: false,
      reason: "locked",
      lockedUntil: record.lockedUntil ?? undefined,
    };
  }

  if (isOTPExpired(record)) {
    logger.warn({ email }, "OTP has expired");
    return { success: false, reason: "expired" };
  }

  const isValid = verifyOTP(otp, record.tokenHash);

  if (!isValid) {
    return await handleFailedVerification(email, record.attempts);
  }

  await markOTPAsVerified(email);
  logger.info({ email }, "OTP verified successfully");

  return { success: true };
}

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
