'use server';

import { Resend } from "resend";
import { generateOTP, getOTPExpiration, isValidOTPFormat } from "@/lib/auth/otp";
import { createOTPToken, verifyOTPToken } from "@/lib/auth/otp-repository";
import {
    checkSendRateLimit,
    checkSendRateLimitByIP,
    checkResendCooldown,
    setResendCooldown,
    getCanResendAt,
    checkVerifyRateLimit,
} from "@/lib/auth/otp-rate-limit";
import { logger } from "@/lib/logger";
import OTPEmail from "@/emails/otp-email";
import { headers } from "next/headers";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

export async function sendOTPAction(email: string, locale: string = "en") {
    try {
        // Validate email format
        if (!email || typeof email !== "string") {
            return { success: false, error: "Invalid email address" };
        }

        const normalizedEmail = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return { success: false, error: "Invalid email format" };
        }

        // Get IP address from headers
        const headersList = await headers();
        const forwarded = headersList.get("x-forwarded-for");
        const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

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

        const normalizedEmail = email.toLowerCase().trim();

        // Get IP address for rate limiting
        const headersList = await headers();
        const forwarded = headersList.get("x-forwarded-for");
        const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

        // Check verify rate limit
        const isAllowed = await checkVerifyRateLimit(ip);
        if (!isAllowed) {
            logger.warn({ ip, email: normalizedEmail }, "OTP verify rate limit exceeded");
            return { success: false, error: "Too many verification attempts. Please try again later." };
        }

        // Verify the OTP
        const result = await verifyOTPToken(normalizedEmail, otp);

        if (!result.success) {
            switch (result.reason) {
                case "not_found":
                    return { success: false, error: "No verification code found. Please request a new one." };
                case "expired":
                    return { success: false, error: "Verification code has expired. Please request a new one." };
                case "locked":
                case "max_attempts":
                    const lockMinutes = result.lockedUntil
                        ? Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000)
                        : 15;
                    return {
                        success: false,
                        error: `Too many failed attempts. Account locked for ${lockMinutes} minutes.`,
                        lockedUntil: result.lockedUntil ? Math.floor(result.lockedUntil.getTime() / 1000) : undefined,
                    };
                case "invalid":
                    return {
                        success: false,
                        error: "Invalid verification code. Please try again.",
                        attemptsRemaining: result.attemptsRemaining,
                    };
                default:
                    return { success: false, error: "Verification failed. Please try again." };
            }
        }

        logger.info({ email: normalizedEmail }, "OTP verified successfully");
        return { success: true, email: normalizedEmail };
    } catch (err) {
        logger.error({ error: err }, "Verify OTP Action error");
        return { success: false, error: "Internal server error" };
    }
}
