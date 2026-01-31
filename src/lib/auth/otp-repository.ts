import { db } from "@/lib/db";
import { otpTokens } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { hashOTP, verifyOTP, getOTPExpiration, getLockoutExpiration, getMaxAttempts } from "./otp";
import { logger } from "@/lib/logger";

/**
 * Create a new OTP token for an email
 * Deletes any existing OTP for this email first
 */
export async function createOTPToken(
  email: string,
  otp: string,
  ipAddress?: string
): Promise<{ success: boolean; expiresAt: Date }> {
  try {
    const normalizedEmail = email.toLowerCase();
    const tokenHash = hashOTP(otp);
    const expiresAt = getOTPExpiration();

    // Delete any existing OTP for this email
    await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));

    // Create new OTP token
    await db.insert(otpTokens).values({
      email: normalizedEmail,
      tokenHash,
      expires: expiresAt,
      ipAddress,
    });

    logger.info({ email: normalizedEmail }, "OTP token created");

    return { success: true, expiresAt };
  } catch (error) {
    logger.error({ error, email }, "Failed to create OTP token");
    throw error;
  }
}

/**
 * Verify an OTP token
 * Returns verification result and updates attempt counter
 */
export async function verifyOTPToken(
  email: string,
  otp: string
): Promise<{
  success: boolean;
  reason?: "not_found" | "expired" | "locked" | "invalid" | "max_attempts";
  attemptsRemaining?: number;
  lockedUntil?: Date;
}> {
  try {
    const normalizedEmail = email.toLowerCase();

    // Find the OTP record
    const [record] = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.email, normalizedEmail))
      .limit(1);

    if (!record) {
      logger.warn({ email: normalizedEmail }, "OTP token not found");
      return { success: false, reason: "not_found" };
    }

    // Check if account is locked
    if (record.lockedUntil && record.lockedUntil > new Date()) {
      logger.warn({ email: normalizedEmail, lockedUntil: record.lockedUntil }, "Account is locked");
      return {
        success: false,
        reason: "locked",
        lockedUntil: record.lockedUntil,
      };
    }

    // Check if OTP has expired
    if (record.expires < new Date()) {
      logger.warn({ email: normalizedEmail }, "OTP has expired");
      return { success: false, reason: "expired" };
    }

    // Verify the OTP
    const isValid = verifyOTP(otp, record.tokenHash);

    if (!isValid) {
      // Increment attempts
      const newAttempts = record.attempts + 1;
      const maxAttempts = getMaxAttempts();

      if (newAttempts >= maxAttempts) {
        // Lock the account
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

      // Update attempts without locking
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

    // Valid OTP - mark as verified
    await db
      .update(otpTokens)
      .set({
        verifiedAt: new Date(),
      })
      .where(eq(otpTokens.email, normalizedEmail));

    logger.info({ email: normalizedEmail }, "OTP verified successfully");

    return { success: true };
  } catch (error) {
    logger.error({ error, email }, "Failed to verify OTP token");
    throw error;
  }
}

/**
 * Check if an account is locked
 */
export async function isAccountLocked(email: string): Promise<{
  locked: boolean;
  lockedUntil?: Date;
}> {
  try {
    const normalizedEmail = email.toLowerCase();

    const [record] = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.email, normalizedEmail))
      .limit(1);

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

/**
 * Delete verified or expired OTP tokens
 * This is called after successful login or can be run as cleanup
 */
export async function deleteOTPToken(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase();
    await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));
    logger.info({ email: normalizedEmail }, "OTP token deleted");
  } catch (error) {
    logger.error({ error, email }, "Failed to delete OTP token");
  }
}

/**
 * Clean up expired OTP tokens (can be run periodically)
 */
export async function cleanupExpiredOTPTokens(): Promise<number> {
  try {
    const result = await db
      .delete(otpTokens)
      .where(lt(otpTokens.expires, new Date()));

    logger.info({ deleted: result.rowCount }, "Cleaned up expired OTP tokens");
    return result.rowCount || 0;
  } catch (error) {
    logger.error({ error }, "Failed to cleanup expired OTP tokens");
    return 0;
  }
}
