"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { signOut } from "@/auth";
import { withAuth } from "@/lib/auth-actions";
import { db } from "@/lib/db";
import { users } from "@/persistence";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import OTPEmail from "@/emails/otp-email";
import { getClientIP } from "@/lib/utils/ip";
import { normalizeEmail } from "@/lib/utils/email";
import { ValidationError, RateLimitError } from "@/lib/errors";
import { generateOTP } from "./services/otp";
import {
  checkSendRateLimit,
  checkSendRateLimitByIP,
  checkResendCooldown,
  setResendCooldown,
  getCanResendAt,
} from "./services/otp-rate-limit";
import { createOTPToken } from "@/features/auth/server/repositories/otp-repository";

const MAX_EMAIL_LENGTH = 254;

function getResendClient(): Resend | null {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (apiKey == null || apiKey === "") {
    return null;
  }
  return new Resend(apiKey);
}

export async function sendOTPAction(email: string, _locale: string = "en") {
  try {
    if (email === "" || typeof email !== "string") {
      throw new ValidationError("Invalid email address");
    }

    if (email.length > MAX_EMAIL_LENGTH) {
      logger.warn({ emailLength: email.length }, "Email too long, rejecting");
      throw new ValidationError("Invalid email address");
    }

    const normalizedEmail = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new ValidationError("Invalid email format");
    }

    const ip = await getClientIP();

    const cooldownCheck = await checkResendCooldown(normalizedEmail);
    if (!cooldownCheck.allowed) {
      logger.warn(
        { email: normalizedEmail, retryAfter: cooldownCheck.retryAfter },
        "OTP resend cooldown active"
      );
      throw new RateLimitError(
        "Please wait before requesting another code",
        cooldownCheck.retryAfter
      );
    }

    const emailRateLimit = await checkSendRateLimit(normalizedEmail);
    if (!emailRateLimit.allowed) {
      logger.warn({ email: normalizedEmail }, "OTP send rate limit exceeded");
      throw new RateLimitError(
        "Too many requests. Please try again later.",
        emailRateLimit.retryAfter
      );
    }

    const ipRateLimit = await checkSendRateLimitByIP(ip);
    if (!ipRateLimit.allowed) {
      logger.warn({ ip }, "OTP send IP rate limit exceeded");
      throw new RateLimitError(
        "Too many requests from this IP. Please try again later.",
        ipRateLimit.retryAfter
      );
    }

    const otp = generateOTP();
    const { expiresAt } = await createOTPToken(normalizedEmail, otp, ip);

    const resend = getResendClient();
    if (resend == null) {
      logger.warn("AUTH_RESEND_KEY not configured, skipping email send");
      logger.info({ email: normalizedEmail, otp }, "OTP generated (dev mode)");
    } else {
      try {
        const headersList = await headers();
        const host = headersList.get("host") ?? "localhost";
        await resend.emails.send({
          from: process.env.AUTH_EMAIL_FROM ?? "noreply@example.com",
          to: normalizedEmail,
          subject: `Your verification code is ${otp}`,
          react: OTPEmail({
            otp,
            host,
            expiresInMinutes: 5,
          }),
        });

        logger.info({ email: normalizedEmail }, "OTP email sent successfully");
      } catch (err) {
        logger.error({ error: err, email: normalizedEmail }, "Failed to send OTP email");
        throw new Error("Failed to send verification code. Please try again.");
      }
    }

    await setResendCooldown(normalizedEmail);

    const canResendAt = await getCanResendAt(normalizedEmail);
    const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return {
      expiresIn,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      canResendAt,
    };
  } catch (err) {
    logger.error({ error: err }, "Send OTP Action error");
    throw err;
  }
}

export const deleteAccount = withAuth(async (userId: string) => {
  try {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    await signOut({ redirectTo: "/" });
  } catch (error) {
    logger.error({ error }, "Failed to delete account");
    throw error;
  }
});
