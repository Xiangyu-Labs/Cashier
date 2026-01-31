import { NextRequest, NextResponse } from "next/server";
import { isValidOTPFormat } from "@/lib/auth/otp";
import { verifyOTPToken } from "@/lib/auth/otp-repository";
import { checkVerifyRateLimit } from "@/lib/auth/otp-rate-limit";
import { logger } from "@/lib/logger";

/**
 * Verify OTP and return verification status
 * The actual sign-in happens in the Credentials provider
 * POST /api/auth/verify-otp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // Validate inputs
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== "string") {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Validate OTP format
    if (!isValidOTPFormat(otp)) {
      return NextResponse.json(
        { error: "Verification code must be 6 digits" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Get IP address for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Check verify rate limit (10 per minute per IP)
    const isAllowed = await checkVerifyRateLimit(ip);
    if (!isAllowed) {
      logger.warn({ ip, email: normalizedEmail }, "OTP verify rate limit exceeded");
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Verify the OTP
    const result = await verifyOTPToken(normalizedEmail, otp);

    if (!result.success) {
      switch (result.reason) {
        case "not_found":
          return NextResponse.json(
            { error: "No verification code found. Please request a new one." },
            { status: 404 }
          );

        case "expired":
          return NextResponse.json(
            { error: "Verification code has expired. Please request a new one." },
            { status: 400 }
          );

        case "locked":
          const lockedMinutes = result.lockedUntil
            ? Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000)
            : 15;
          return NextResponse.json(
            {
              error: `Account temporarily locked due to too many failed attempts. Please try again in ${lockedMinutes} minutes.`,
              lockedUntil: result.lockedUntil
                ? Math.floor(result.lockedUntil.getTime() / 1000)
                : undefined,
            },
            { status: 423 }
          );

        case "max_attempts":
          const lockMinutes = result.lockedUntil
            ? Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000)
            : 15;
          return NextResponse.json(
            {
              error: `Too many failed attempts. Account locked for ${lockMinutes} minutes.`,
              lockedUntil: result.lockedUntil
                ? Math.floor(result.lockedUntil.getTime() / 1000)
                : undefined,
            },
            { status: 423 }
          );

        case "invalid":
          return NextResponse.json(
            {
              error: "Invalid verification code. Please try again.",
              attemptsRemaining: result.attemptsRemaining,
            },
            { status: 400 }
          );

        default:
          return NextResponse.json(
            { error: "Verification failed. Please try again." },
            { status: 400 }
          );
      }
    }

    // OTP is valid - return success
    // The client should now call signIn("credentials", { email, otp })
    logger.info({ email: normalizedEmail }, "OTP verified successfully");

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
    });
  } catch (error) {
    logger.error({ error }, "Verify OTP API error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
