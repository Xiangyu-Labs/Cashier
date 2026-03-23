import OTPEmail from "@/emails/otp-email";
import { logger } from "@/lib/logger";
import { RateLimitError, AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { normalizeEmail, DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";
import type { SupportedLocale } from "@/i18n/locales";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { SendOTPEmail } from "@/modules/auth/contract-schemas";
import { createOTPToken } from "@/modules/auth/repositories/otp-repository";
import {
  checkResendCooldown,
  checkSendRateLimit,
  checkSendRateLimitByIP,
  getCanResendAt,
  setResendCooldown,
} from "@/modules/auth/services/otp-rate-limit";
import { generateOTP } from "@/modules/auth/services/otp";

type OTPAuthEmailMessages = {
  otpSubject: string;
  otpPreview: string;
  otpHeading: string;
  otpIntro: string;
  otpCodeLabel: string;
  otpExpiry: string;
  otpWarning: string;
  otpFooter: string;
};

async function getOTPEmailCopy(
  locale: SupportedLocale,
  host: string,
  otp: string,
  expiresInMinutes: number
) {
  const messages = (await import(`../../../../../messages/${locale}.json`)).default as {
    AuthEmail: OTPAuthEmailMessages;
  };
  const t = messages.AuthEmail;
  return {
    subject: t.otpSubject.replace("{otp}", otp),
    copy: {
      preview: t.otpPreview,
      heading: t.otpHeading.replace("{host}", host),
      intro: t.otpIntro,
      codeLabel: t.otpCodeLabel,
      expiry: t.otpExpiry.replace("{minutes}", String(expiresInMinutes)),
      warning: t.otpWarning,
      footer: t.otpFooter,
    },
  };
}

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
  const apiKey = runtimeEnv.authResendKey;
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

export async function sendOTP(params: {
  email: SendOTPEmail;
  ip: string;
  host: string;
  locale?: SupportedLocale;
}): Promise<{
  expiresIn: number;
  expiresAt: number;
  canResendAt: number | null;
}> {
  try {
    const normalizedEmail = normalizeEmail(params.email);

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
        const locale = params.locale ?? DEFAULT_LOCALE;
        const expiresInMinutes = 5;
        const { subject, copy } = await getOTPEmailCopy(locale, params.host, otp, expiresInMinutes);
        await resend.emails.send({
          from: runtimeEnv.authEmailFrom ?? DEFAULT_AUTH_EMAIL_FROM,
          to: normalizedEmail,
          subject,
          react: OTPEmail({
            otp,
            host: params.host,
            expiresInMinutes,
            locale,
            copy,
          }),
        });

        logger.info({ email: normalizedEmail }, "OTP email sent successfully");
      } catch (error) {
        logger.error({ error, email: normalizedEmail }, "Failed to send OTP email");
        throw new AppError(
          "Failed to send verification code. Please try again.",
          "EMAIL_SEND_FAILED"
        );
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
