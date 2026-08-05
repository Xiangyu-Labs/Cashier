import { NextResponse } from "next/server";
import { FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { FEATURE_MESSAGE_VERSION } from "@/i18n/feature-message-version";

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string; feature: string }> }
) {
  const { locale, feature } = await context.params;
  if ((locale !== "en" && locale !== "zh") || !(feature in FEATURE_MESSAGES)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = (await import(`../../../../../../messages/${locale}/${feature}.json`))
    .default as Record<string, unknown>;
  return NextResponse.json(messages, {
    headers: {
      "Cache-Control": "no-store",
      "X-Message-Version": FEATURE_MESSAGE_VERSION,
    },
  });
}
