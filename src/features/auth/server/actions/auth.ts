"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { generateOTP } from "@/modules/auth/services/otp";
import { createOTPToken } from "@/features/auth/server/repositories/otp-repository";
import {
  checkSendRateLimit,
  checkSendRateLimitByIP,
  checkResendCooldown,
  setResendCooldown,
  getCanResendAt,
} from "@/modules/auth/services/otp-rate-limit";
import { logger } from "@/lib/logger";
import OTPEmail from "@/emails/otp-email";
import { getClientIP } from "@/lib/utils/ip";
import { normalizeEmail } from "@/lib/utils/email";
import { ValidationError, RateLimitError } from "@/lib/errors";

// RFC 5321: Maximum email length is 254 characters (local part max 64 + @ + domain max 189)
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
    // Validate email format and length
    if (email === "" || typeof email !== "string") {
      throw new ValidationError("Invalid email address");
    }

    // Check email length to prevent DoS attacks with超长 strings
    if (email.length > MAX_EMAIL_LENGTH) {
      logger.warn({ emailLength: email.length }, "Email too long, rejecting");
      throw new ValidationError("Invalid email address");
    }

    const normalizedEmail = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new ValidationError("Invalid email format");
    }

    // Get IP address from headers
    const ip = await getClientIP();

    // Check resend cooldown
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

    // Check email rate limit
    const emailRateLimit = await checkSendRateLimit(normalizedEmail);
    if (!emailRateLimit.allowed) {
      logger.warn({ email: normalizedEmail }, "OTP send rate limit exceeded");
      throw new RateLimitError(
        "Too many requests. Please try again later.",
        emailRateLimit.retryAfter
      );
    }

    // Check IP rate limit
    const ipRateLimit = await checkSendRateLimitByIP(ip);
    if (!ipRateLimit.allowed) {
      logger.warn({ ip }, "OTP send IP rate limit exceeded");
      throw new RateLimitError(
        "Too many requests from this IP. Please try again later.",
        ipRateLimit.retryAfter
      );
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in database
    const { expiresAt } = await createOTPToken(normalizedEmail, otp, ip);

    // Send email
    const resend = getResendClient();
    if (resend == null) {
      logger.warn("AUTH_RESEND_KEY not configured, skipping email send");
      // In development, log the OTP
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

    // Set resend cooldown
    await setResendCooldown(normalizedEmail);

    // Get when user can resend
    const canResendAt = await getCanResendAt(normalizedEmail);
    const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return {
      expiresIn, // seconds
      expiresAt: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp
      canResendAt, // Unix timestamp or null
    };
  } catch (err) {
    logger.error({ error: err }, "Send OTP Action error");
    throw err;
  }
}
