import { db } from "@/lib/db";
import { otpTokens } from "@/persistence/schema/auth";
import { eq, lt } from "drizzle-orm";
import { hashOTP, getOTPExpiration } from "@/modules/auth/services/otp";
import { logger } from "@/lib/logger";

export async function createOTPToken(
  email: string,
  otp: string,
  ipAddress?: string
): Promise<{ success: boolean; expiresAt: Date }> {
  try {
    const normalizedEmail = email.toLowerCase();
    const tokenHash = hashOTP(otp);
    const expiresAt = getOTPExpiration();

    await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));

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

export async function deleteOTPToken(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase();
    await db.delete(otpTokens).where(eq(otpTokens.email, normalizedEmail));
    logger.info({ email: normalizedEmail }, "OTP token deleted");
  } catch (error) {
    logger.error({ error, email }, "Failed to delete OTP token");
  }
}

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
