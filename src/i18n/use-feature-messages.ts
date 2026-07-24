"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { pickMessages, FEATURE_MESSAGES } from "./client-feature-messages";

/**
 * Loads a subset of locale messages for a specific feature boundary.
 * Returns null while the messages are being fetched, giving the caller
 * an opportunity to show a skeleton fallback.
 */
export function useFeatureMessages(
  feature: keyof typeof FEATURE_MESSAGES
): Record<string, unknown> | null {
  const locale = useLocale();
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;

    import(`../../messages/${locale}.json`).then((mod) => {
      if (cancelled) return;
      setMessages(pickMessages(mod.default, FEATURE_MESSAGES[feature]));
    });

    return () => {
      cancelled = true;
    };
  }, [locale, feature]);

  return messages;
}
