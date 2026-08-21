import { NextResponse } from "next/server";
import { FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { FEATURE_MESSAGE_VERSION } from "@/i18n/feature-message-version";
import { importFeatureMessages } from "@/i18n/feature-message-imports";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/locales";

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string; feature: string }> }
) {
  const { locale, feature } = await context.params;
  if (
    !SUPPORTED_LOCALES.includes(locale as SupportedLocale) ||
    !Object.hasOwn(FEATURE_MESSAGES, feature)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = await importFeatureMessages(
    locale as SupportedLocale,
    feature as keyof typeof FEATURE_MESSAGES
  );
  return NextResponse.json(messages, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Message-Version": FEATURE_MESSAGE_VERSION,
    },
  });
}
