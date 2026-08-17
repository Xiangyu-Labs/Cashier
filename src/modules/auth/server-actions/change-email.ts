"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/utils/email";
import { parseSendOTPEmail } from "../contract-schemas";
import { sendEmailChangeCode, verifyEmailChangeCode } from "../application/use-cases/change-email";
import { serverComposition } from "@/application/server-composition-root";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId == null || userId === "") throw new UnauthorizedError();
  return userId;
}

export type EmailChangeErrorCode =
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
  if (error instanceof ConflictError) return "email_in_use";
  if (error instanceof RateLimitError) {
    return /locked|incorrect attempts/i.test(error.message) ? "locked" : "rate_limited";
  }
  if (error instanceof ValidationError) {
    if (/different/i.test(error.message)) return "same_email";
    if (/expired/i.test(error.message)) return "expired_code";
    if (/code|challenge|verification/i.test(error.message)) return "invalid_code";
  }
  return "unknown";
}

export async function sendEmailChangeCodeAction(
  inputEmail: string,
  locale?: string
): Promise<SendEmailChangeCodeActionResult> {
  try {
    const userId = await requireUserId();
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
    return { ok: false, code: mapEmailChangeError(error) };
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
    return { ok: false, code: mapEmailChangeError(error) };
  }
}
