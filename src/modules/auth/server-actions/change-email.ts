"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { UnauthorizedError } from "@/lib/errors";
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

export async function sendEmailChangeCodeAction(inputEmail: string, locale?: string) {
  const userId = await requireUserId();
  const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const resolvedLocale = resolveSupportedLocale({
    explicitLocale: locale ?? null,
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value ?? null,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return sendEmailChangeCode(
    {
      userId,
      newEmail,
      locale: resolvedLocale,
      host: requestHeaders.get("host") ?? "Cashier",
    },
    { emailDelivery: serverComposition.email, accounts: serverComposition.accountSecurity }
  );
}

export async function verifyEmailChangeCodeAction(inputEmail: string, otp: string) {
  const userId = await requireUserId();
  const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
  return verifyEmailChangeCode(userId, newEmail, otp, serverComposition.accountSecurity);
}
