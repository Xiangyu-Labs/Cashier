'use server';

import { headers } from "next/headers";
import { Resend } from "resend";
import { generateOTP, isValidOTPFormat } from "@/features/auth/server/services/otp";
import { createOTPToken } from "@/features/auth/server/repositories/otp-repository";
import { findOTPRecord, verifyOTPWithPolicy } from "@/features/auth/server/services/otp-verification";
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

const resend = new Resend(process.env.AUTH_RESEND_KEY);

// RFC 5321: Maximum email length is 254 characters (local part max 64 + @ + domain max 189)
const MAX_EMAIL_LENGTH = 254;

export async function sendOTPAction(email: string, _locale: string = "en") {
    try {
        // Validate email format and length
        if (!email || typeof email !== "string") {
            return { success: false, error: "Invalid email address" };
        }

        // Check email length to prevent DoS attacks with超长 strings
        if (email.length > MAX_EMAIL_LENGTH) {
            logger.warn({ emailLength: email.length }, "Email too long, rejecting");
            return { success: false, error: "Invalid email address" };
        }

        const normalizedEmail = normalizeEmail(email);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return { success: false, error: "Invalid email format" };
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
            return {
                success: false,
                error: "Please wait before requesting another code",
                retryAfter: cooldownCheck.retryAfter,
            };
        }

        // Check email rate limit
        const emailRateLimit = await checkSendRateLimit(normalizedEmail);
        if (!emailRateLimit.allowed) {
            logger.warn({ email: normalizedEmail }, "OTP send rate limit exceeded");
            return {
                success: false,
                error: "Too many requests. Please try again later.",
                retryAfter: emailRateLimit.retryAfter,
            };
        }

        // Check IP rate limit
        const ipRateLimit = await checkSendRateLimitByIP(ip);
        if (!ipRateLimit.allowed) {
            logger.warn({ ip }, "OTP send IP rate limit exceeded");
            return {
                success: false,
                error: "Too many requests from this IP. Please try again later.",
                retryAfter: ipRateLimit.retryAfter,
            };
        }

        // Generate OTP
        const otp = generateOTP();

        // Store OTP in database
        const { expiresAt } = await createOTPToken(normalizedEmail, otp, ip);

        // Send email
        if (!process.env.AUTH_RESEND_KEY) {
            logger.warn("AUTH_RESEND_KEY not configured, skipping email send");
            // In development, log the OTP
            logger.info({ email: normalizedEmail, otp }, "OTP generated (dev mode)");
        } else {
            try {
                const headersList = await headers();
                const host = headersList.get("host") || "localhost";
                await resend.emails.send({
                    from: process.env.AUTH_EMAIL_FROM || "noreply@example.com",
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
                return { success: false, error: "Failed to send verification code. Please try again." };
            }
        }

        // Set resend cooldown
        await setResendCooldown(normalizedEmail);

        // Get when user can resend
        const canResendAt = await getCanResendAt(normalizedEmail);
        const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

        return {
            success: true,
            expiresIn, // seconds
            expiresAt: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp
            canResendAt, // Unix timestamp or null
        };
    } catch (err) {
        logger.error({ error: err }, "Send OTP Action error");
        return { success: false, error: "Internal server error" };
    }
}

export async function verifyOTPAction(email: string, otp: string) {
    try {
        // Validate inputs
        if (!email || typeof email !== "string") {
            return { success: false, error: "Invalid email address" };
        }

        if (!otp || typeof otp !== "string") {
            return { success: false, error: "Invalid verification code" };
        }

        // Validate OTP format
        if (!isValidOTPFormat(otp)) {
            return { success: false, error: "Verification code must be 6 digits" };
        }

        const normalizedEmail = normalizeEmail(email);

        // Get IP address for rate limiting
        const ip = await getClientIP();

        // Check verify rate limit
        const isAllowed = await checkVerifyRateLimit(ip);
        if (!isAllowed) {
            logger.warn({ ip, email: normalizedEmail }, "OTP verify rate limit exceeded");
            return { success: false, error: "Too many verification attempts. Please try again later." };
        }

        // Find OTP record first (data access layer)
        const record = await findOTPRecord(normalizedEmail);
        if (!record) {
            logger.warn({ email: normalizedEmail }, "OTP token not found");
            return {
                success: false,
                error: "Invalid or expired verification code. Please try again or request a new code.",
            };
        }

        // Verify the OTP with business logic (service layer)
        const result = await verifyOTPWithPolicy(normalizedEmail, otp, record);

        if (!result.success) {
            // Internal logging with detailed reason for debugging/auditing
            // Do not expose detailed error reason to client to prevent user enumeration attacks
            logger.warn({
                email: normalizedEmail,
                reason: result.reason,
                attemptsRemaining: result.attemptsRemaining,
            }, "OTP verification failed");

            // Return unified error message to prevent information leakage
            // Only expose: attemptsRemaining (for UI guidance) and lockedUntil (when locked)
            switch (result.reason) {
                case "locked":
                case "max_attempts":
                    // Account is locked - must inform user but with generic message
                    return {
                        success: false,
                        error: "Account temporarily locked due to too many failed attempts. Please try again later.",
                        lockedUntil: result.lockedUntil
                            ? Math.floor(result.lockedUntil.getTime() / 1000)
                            : undefined,
                    };
                default:
                    // Unified error for: not_found, expired, invalid
                    // This prevents attackers from determining if an email is registered
                    return {
                        success: false,
                        error: "Invalid or expired verification code. Please try again or request a new code.",
                        attemptsRemaining: result.attemptsRemaining,
                    };
            }
        }

        logger.info({ email: normalizedEmail }, "OTP verified successfully");
        return { success: true, email: normalizedEmail };
    } catch (err) {
        logger.error({ error: err }, "Verify OTP Action error");
        return { success: false, error: "Internal server error" };
    }
}
