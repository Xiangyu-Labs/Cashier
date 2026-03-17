import { db } from "@/lib/db";
import { otpTokens } from "@/features/auth/server/schema";
import { eq, lt } from "drizzle-orm";
import { hashOTP, getOTPExpiration } from "../services/otp";
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
    const result = await db.delete(otpTokens).where(lt(otpTokens.expires, new Date())).returning();

    const deletedCount = result.length;
    logger.info({ deleted: deletedCount }, "Cleaned up expired OTP tokens");
    return deletedCount;
  } catch (error) {
    logger.error({ error }, "Failed to cleanup expired OTP tokens");
    return 0;
  }
}
