import OTPEmail from "@/emails/otp-email";
import { logger } from "@/lib/logger";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/utils/email";
import { createOTPToken } from "@/modules/auth/repositories/otp-repository";
import {
  checkResendCooldown,
  checkSendRateLimit,
  checkSendRateLimitByIP,
  getCanResendAt,
  setResendCooldown,
} from "@/modules/auth/services/otp-rate-limit";
import { generateOTP } from "@/modules/auth/services/otp";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthResendEmailClient = {
  emails: {
    send: (params: {
      from: string;
      to: string;
      subject: string;
      react: ReturnType<typeof OTPEmail>;
    }) => Promise<unknown>;
  };
};

function getResendClient(): AuthResendEmailClient | null {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (apiKey == null || apiKey === "") {
    return null;
  }

  return {
    emails: {
      send: async (params) => {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        return resend.emails.send(params);
      },
    },
  };
}

export async function sendOTP(params: { email: string; ip: string; host: string }): Promise<{
  expiresIn: number;
  expiresAt: number;
  canResendAt: number | null;
}> {
  try {
    if (params.email === "" || typeof params.email !== "string") {
      throw new ValidationError("Invalid email address");
    }

    if (params.email.length > MAX_EMAIL_LENGTH) {
      logger.warn({ emailLength: params.email.length }, "Email too long, rejecting");
      throw new ValidationError("Invalid email address");
    }

    const normalizedEmail = normalizeEmail(params.email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new ValidationError("Invalid email format");
    }

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

    const ipRateLimit = await checkSendRateLimitByIP(params.ip);
    if (!ipRateLimit.allowed) {
      logger.warn({ ip: params.ip }, "OTP send IP rate limit exceeded");
      throw new RateLimitError(
        "Too many requests from this IP. Please try again later.",
        ipRateLimit.retryAfter
      );
    }

    const otp = generateOTP();
    const { expiresAt } = await createOTPToken(normalizedEmail, otp, params.ip);

    const resend = getResendClient();
    if (resend == null) {
      logger.warn("AUTH_RESEND_KEY not configured, skipping email send");
      logger.info({ email: normalizedEmail, otp }, "OTP generated (dev mode)");
    } else {
      try {
        await resend.emails.send({
          from: process.env.AUTH_EMAIL_FROM ?? "noreply@example.com",
          to: normalizedEmail,
          subject: `Your verification code is ${otp}`,
          react: OTPEmail({
            otp,
            host: params.host,
            expiresInMinutes: 5,
          }),
        });

        logger.info({ email: normalizedEmail }, "OTP email sent successfully");
      } catch (error) {
        logger.error({ error, email: normalizedEmail }, "Failed to send OTP email");
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
  } catch (error) {
    logger.error({ error }, "Send OTP use case error");
    throw error;
  }
}
