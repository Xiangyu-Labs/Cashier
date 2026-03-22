"use server";
import { cookies, headers } from "next/headers";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { sendOTP } from "@/modules/auth/use-cases";
import { parseSendOTPEmail } from "../contract-schemas";

export async function sendOTPAction(email: string, locale?: string) {
  const validatedEmail = parseSendOTPEmail(email);
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const resolvedLocale = resolveSupportedLocale({
    explicitLocale: locale,
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  return sendOTP({
    email: validatedEmail,
    ip: getClientIPFromHeaders(requestHeaders),
    host: requestHeaders.get("host") ?? "localhost",
    locale: resolvedLocale,
  });
}
