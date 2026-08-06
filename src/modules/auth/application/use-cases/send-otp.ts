import OTPEmail from "@/emails/otp-email";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { RateLimitError, AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { normalizeEmail, DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";
import type { SupportedLocale } from "@/i18n/locales";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import type { SendOTPEmail } from "@/modules/auth/contract-schemas";
import { createOTPToken, discardOTPToken } from "@/modules/auth/repositories/otp-repository";
import {
  checkResendCooldown,
  checkSendRateLimit,
  checkSendRateLimitByIP,
  getCanResendAt,
  setResendCooldown,
} from "@/modules/auth/services/otp-rate-limit";
import { generateOTP, getResendCooldown } from "@/modules/auth/services/otp";
import { isRegistrationAllowed } from "./registration-policy";
import type { EmailDeliveryPort, OtpTokenPort, UserAccountPort } from "@/application/contracts";
import type { RateLimitPort } from "../ports";

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

export async function sendOTP(
  params: {
    email: SendOTPEmail;
    ip: string;
    host: string;
    locale?: SupportedLocale;
  },
  dependencies: {
    emailDelivery: EmailDeliveryPort;
    tokens: OtpTokenPort;
    users: UserAccountPort;
    rateLimiter: RateLimitPort;
  }
): Promise<{
  expiresIn: number;
  expiresAt: number;
  canResendAt: number | null;
}> {
  try {
    const normalizedEmail = normalizeEmail(params.email);

    if (runtimeEnv.authResendKey == null) {
      throw new AppError("Email login is not configured", "EMAIL_NOT_CONFIGURED", 503);
    }

    const ipRateLimit = await checkSendRateLimitByIP(params.ip, dependencies.rateLimiter);
    if (!ipRateLimit.allowed) {
      logger.warn({ subject: logIdentifier("ip", params.ip) }, "OTP send IP rate limit exceeded");
      throw new RateLimitError(
        "Too many requests from this IP. Please try again later.",
        ipRateLimit.retryAfter
      );
    }

    const emailRateLimit = await checkSendRateLimit(normalizedEmail, dependencies.rateLimiter);
    if (!emailRateLimit.allowed) {
      logger.warn(
        { subject: logIdentifier("email", normalizedEmail) },
        "OTP send rate limit exceeded"
      );
      throw new RateLimitError(
        "Too many requests. Please try again later.",
        emailRateLimit.retryAfter
      );
    }

    const cooldownCheck = await checkResendCooldown(normalizedEmail, dependencies.rateLimiter);
    if (!cooldownCheck.allowed) {
      logger.warn(
        { subject: logIdentifier("email", normalizedEmail), retryAfter: cooldownCheck.retryAfter },
        "OTP resend cooldown active"
      );
      throw new RateLimitError(
        "Please wait before requesting another code",
        cooldownCheck.retryAfter
      );
    }

    if (!(await isRegistrationAllowed(normalizedEmail, dependencies.users))) {
      const now = Date.now();
      const expiresAt = new Date(now + runtimeEnv.otpExpiresSeconds * 1000);
      return {
        expiresIn: runtimeEnv.otpExpiresSeconds,
        expiresAt: Math.floor(expiresAt.getTime() / 1000),
        canResendAt: Math.floor(now / 1000) + getResendCooldown(),
      };
    }

    const otp = generateOTP();
    const { expiresAt, tokenHash } = await createOTPToken(
      normalizedEmail,
      otp,
      dependencies.tokens,
      params.ip === "unknown" ? undefined : params.ip
    );

    try {
      const locale = params.locale ?? DEFAULT_LOCALE;
      const expiresInMinutes = 5;
      const { subject, copy } = await getOTPEmailCopy(locale, params.host, otp, expiresInMinutes);
      const delivery = await dependencies.emailDelivery.send({
        from: runtimeEnv.authEmailFrom ?? DEFAULT_AUTH_EMAIL_FROM,
        to: normalizedEmail,
        subject,
        content: OTPEmail({ otp, host: params.host, expiresInMinutes, locale, copy }),
      });
      if (delivery === "not_configured") {
        throw new AppError("Email login is not configured", "EMAIL_NOT_CONFIGURED", 503);
      } else {
        logger.info(
          { subject: logIdentifier("email", normalizedEmail) },
          "OTP email sent successfully"
        );
      }
    } catch (error) {
      await discardOTPToken(normalizedEmail, tokenHash, dependencies.tokens).catch(
        (discardError) => {
          logger.error(
            {
              error: discardError,
              subject: logIdentifier("email", normalizedEmail),
            },
            "Failed to discard OTP token after email failure"
          );
        }
      );
      logger.error(
        { error, subject: logIdentifier("email", normalizedEmail) },
        "Failed to send OTP email"
      );
      if (error instanceof AppError && error.code === "EMAIL_NOT_CONFIGURED") {
        throw error;
      }
      throw new AppError(
        "Failed to send verification code. Please try again.",
        "EMAIL_SEND_FAILED"
      );
    }

    await setResendCooldown(normalizedEmail, dependencies.rateLimiter);

    const canResendAt = await getCanResendAt(normalizedEmail, dependencies.rateLimiter);
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
