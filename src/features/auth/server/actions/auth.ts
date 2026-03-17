"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { generateOTP, isValidOTPFormat } from "@/features/auth/server/services/otp";
import { createOTPToken } from "@/features/auth/server/repositories/otp-repository";
import {
  findOTPRecord,
  verifyOTPWithPolicy,
} from "@/features/auth/server/services/otp-verification";
import {
  checkSendRateLimit,
  checkSendRateLimitByIP,
  checkResendCooldown,
  setResendCooldown,
  getCanResendAt,
  checkVerifyRateLimit,
} from "@/features/auth/server/services/otp-rate-limit";
import { logger } from "@/lib/logger";
import OTPEmail from "@/emails/otp-email";
import { getClientIP } from "@/lib/utils/ip";
import { normalizeEmail } from "@/lib/utils/email";
import { ValidationError, RateLimitError, UnauthorizedError } from "@/lib/errors";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

// RFC 5321: Maximum email length is 254 characters (local part max 64 + @ + domain max 189)
const MAX_EMAIL_LENGTH = 254;

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
    if (process.env.AUTH_RESEND_KEY == null || process.env.AUTH_RESEND_KEY === "") {
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

export async function verifyOTPAction(email: string, otp: string) {
  try {
    // Validate inputs
    if (email === "" || typeof email !== "string") {
      throw new ValidationError("Invalid email address");
    }

    if (otp === "" || typeof otp !== "string") {
      throw new ValidationError("Invalid verification code");
    }

    // Validate OTP format
    if (!isValidOTPFormat(otp)) {
      throw new ValidationError("Verification code must be 6 digits");
    }

    const normalizedEmail = normalizeEmail(email);

    // Get IP address for rate limiting
    const ip = await getClientIP();

    // Check verify rate limit
    const isAllowed = await checkVerifyRateLimit(ip);
    if (!isAllowed) {
      logger.warn({ ip, email: normalizedEmail }, "OTP verify rate limit exceeded");
      throw new RateLimitError("Too many verification attempts. Please try again later.");
    }

    // Find OTP record first (data access layer)
    const record = await findOTPRecord(normalizedEmail);
    if (!record) {
      logger.warn({ email: normalizedEmail }, "OTP token not found");
      throw new UnauthorizedError(
        "Invalid or expired verification code. Please try again or request a new code."
      );
    }

    // Verify the OTP with business logic (service layer)
    const result = await verifyOTPWithPolicy(normalizedEmail, otp, record);

    if (!result.success) {
      // Internal logging with detailed reason for debugging/auditing
      // Do not expose detailed error reason to client to prevent user enumeration attacks
      logger.warn(
        {
          email: normalizedEmail,
          reason: result.reason,
          attemptsRemaining: result.attemptsRemaining,
        },
        "OTP verification failed"
      );

      // Return unified error message to prevent information leakage
      // Only expose: attemptsRemaining (for UI guidance) and lockedUntil (when locked)
      switch (result.reason) {
        case "locked":
        case "max_attempts": {
          // Account is locked - must inform user but with generic message
          const error = new RateLimitError(
            "Account temporarily locked due to too many failed attempts. Please try again later."
          );
          (error as Error & { lockedUntil?: number }).lockedUntil = result.lockedUntil
            ? Math.floor(result.lockedUntil.getTime() / 1000)
            : undefined;
          throw error;
        }
        default: {
          // This prevents attackers from determining if an email is registered
          // Unified error for: not_found, expired, invalid
          const error = new UnauthorizedError(
            "Invalid or expired verification code. Please try again or request a new code."
          );
          (error as Error & { attemptsRemaining?: number }).attemptsRemaining =
            result.attemptsRemaining;
          throw error;
        }
      }
    }

    logger.info({ email: normalizedEmail }, "OTP verified successfully");
    return { email: normalizedEmail };
  } catch (err) {
    logger.error({ error: err }, "Verify OTP Action error");
    throw err;
  }
}
