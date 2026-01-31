import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { generateOTP, getOTPExpiration } from "@/lib/auth/otp";
import { createOTPToken } from "@/lib/auth/otp-repository";
import {
  checkSendRateLimit,
  checkSendRateLimitByIP,
  checkResendCooldown,
  setResendCooldown,
  getCanResendAt,
} from "@/lib/auth/otp-rate-limit";
import { logger } from "@/lib/logger";
import OTPEmail from "@/emails/otp-email";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

/**
 * Send OTP to user's email
 * POST /api/auth/send-otp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, locale = "en" } = body;

    // Validate email format
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Get IP address
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Check resend cooldown
    const cooldownCheck = await checkResendCooldown(normalizedEmail);
    if (!cooldownCheck.allowed) {
      logger.warn(
        { email: normalizedEmail, retryAfter: cooldownCheck.retryAfter },
        "OTP resend cooldown active"
      );
      return NextResponse.json(
        {
          error: "Please wait before requesting another code",
          retryAfter: cooldownCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    // Check email rate limit (3 per 15 minutes)
    const emailRateLimit = await checkSendRateLimit(normalizedEmail);
    if (!emailRateLimit.allowed) {
      logger.warn({ email: normalizedEmail }, "OTP send rate limit exceeded");
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: emailRateLimit.retryAfter,
        },
        { status: 429 }
      );
    }

    // Check IP rate limit (10 per hour)
    const ipRateLimit = await checkSendRateLimitByIP(ip);
    if (!ipRateLimit.allowed) {
      logger.warn({ ip }, "OTP send IP rate limit exceeded");
      return NextResponse.json(
        {
          error: "Too many requests from this IP. Please try again later.",
          retryAfter: ipRateLimit.retryAfter,
        },
        { status: 429 }
      );
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
        const host = request.headers.get("host") || "localhost";
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
      } catch (error) {
        logger.error({ error, email: normalizedEmail }, "Failed to send OTP email");
        return NextResponse.json(
          { error: "Failed to send verification code. Please try again." },
          { status: 500 }
        );
      }
    }

    // Set resend cooldown
    await setResendCooldown(normalizedEmail);

    // Get when user can resend
    const canResendAt = await getCanResendAt(normalizedEmail);

    const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    return NextResponse.json({
      success: true,
      expiresIn, // seconds
      expiresAt: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp
      canResendAt, // Unix timestamp or null
    });
  } catch (error) {
    logger.error({ error }, "Send OTP API error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
