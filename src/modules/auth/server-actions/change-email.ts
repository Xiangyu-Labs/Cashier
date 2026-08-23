"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { requireRecentAuth } from "@/lib/auth-actions";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/utils/email";
import { logger } from "@/lib/logger";
import { parseSendOTPEmail } from "../contract-schemas";
import { sendEmailChangeCode, verifyEmailChangeCode } from "../application/use-cases/change-email";
import { serverComposition } from "@/application/server-composition-root";
import { AppError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId == null || userId === "") throw new UnauthorizedError();
  return userId;
}

export type EmailChangeErrorCode =
  | "invalid_email"
  | "reauth_required"
  | "invalid_code"
  | "expired_code"
  | "email_in_use"
  | "rate_limited"
  | "locked"
  | "same_email"
  | "unknown";

export type SendEmailChangeCodeActionResult =
  { ok: true; expiresAt: number; canResendAt: number } | { ok: false; code: EmailChangeErrorCode };

export type VerifyEmailChangeCodeActionResult =
  { ok: true; email: string } | { ok: false; code: EmailChangeErrorCode };

function mapEmailChangeError(error: unknown): EmailChangeErrorCode {
  if (error instanceof AppError && error.code === AUTH_ERROR_CODES.REAUTHENTICATION_REQUIRED) {
    return "reauth_required";
  }
  if (error instanceof ConflictError) return "email_in_use";
  if (error instanceof ValidationError && Array.isArray(error.details?.issues)) {
    return "invalid_email";
  }
  if (error instanceof RateLimitError) return "rate_limited";
  if (error instanceof AppError) {
    switch (error.code) {
      case "EMAIL_CHANGE_LOCKED":
        return "locked";
      case "EMAIL_CHANGE_SAME_EMAIL":
        return "same_email";
      case "EMAIL_CHANGE_EXPIRED_CODE":
        return "expired_code";
      case "EMAIL_CHANGE_INVALID_CODE":
        return "invalid_code";
    }
  }
  return "unknown";
}

export async function sendEmailChangeCodeAction(
  inputEmail: string,
  locale?: string
): Promise<SendEmailChangeCodeActionResult> {
  try {
    const userId = await requireRecentAuth();
    const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
    const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
    const resolvedLocale = resolveSupportedLocale({
      explicitLocale: locale ?? null,
      cookieLocale: cookieStore.get("NEXT_LOCALE")?.value ?? null,
      acceptLanguage: requestHeaders.get("accept-language"),
    });
    const result = await sendEmailChangeCode(
      {
        userId,
        newEmail,
        locale: resolvedLocale,
        host: requestHeaders.get("host") ?? "Cashier",
      },
      { emailDelivery: serverComposition.email, accounts: serverComposition.accountSecurity }
    );
    return {
      ok: true,
      expiresAt: result.expiresAt,
      canResendAt: Math.floor(Date.now() / 1000) + 60,
    };
  } catch (error) {
    const code = mapEmailChangeError(error);
    if (code === "unknown") {
      logger.error(
        { correlationId: crypto.randomUUID(), errorCode: "EMAIL_CHANGE_SEND_FAILED" },
        "Email change code request failed"
      );
    }
    return { ok: false, code };
  }
}

export async function verifyEmailChangeCodeAction(
  inputEmail: string,
  otp: string
): Promise<VerifyEmailChangeCodeActionResult> {
  try {
    const userId = await requireUserId();
    const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
    const result = await verifyEmailChangeCode(
      userId,
      newEmail,
      otp,
      serverComposition.accountSecurity
    );
    return { ok: true, email: result.email };
  } catch (error) {
    const code = mapEmailChangeError(error);
    if (code === "unknown") {
      logger.error(
        { correlationId: crypto.randomUUID(), errorCode: "EMAIL_CHANGE_VERIFY_FAILED" },
        "Email change verification failed"
      );
    }
    return { ok: false, code };
  }
}
