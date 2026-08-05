"use client";
import { useEffect, useState } from "react";
import { FEATURE_MESSAGES } from "./client-feature-messages";
import { FEATURE_MESSAGE_VERSION } from "./feature-message-version";

const messagePromises = new Map<string, Promise<Record<string, unknown>>>();

export function preloadFeatureMessages(
  locale: string,
  feature: keyof typeof FEATURE_MESSAGES
): Promise<Record<string, unknown>> {
  const normalizedLocale = locale === "zh" ? "zh" : "en";
  const cacheKey = `${normalizedLocale}:${feature}`;
  const existing = messagePromises.get(cacheKey);
  if (existing != null) return existing;
  const promise = fetch(`/api/i18n/${normalizedLocale}/${feature}?v=${FEATURE_MESSAGE_VERSION}`, {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load feature messages");
      return (await response.json()) as Record<string, unknown>;
    })
    .catch((error: unknown) => {
      messagePromises.delete(cacheKey);
      throw error;
    });
  messagePromises.set(cacheKey, promise);
  return promise;
}

/**
 * Loads a subset of locale messages for a specific feature boundary.
 * Returns null while the messages are being fetched, giving the caller
 * an opportunity to show a skeleton fallback.
 *
 * @param locale - The current locale string (e.g. "en", "zh").
 * @param feature - The feature key whose namespaces to pick.
 */
export function useFeatureMessages(
  locale: string,
  feature: keyof typeof FEATURE_MESSAGES
): Record<string, unknown> | null {
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    preloadFeatureMessages(locale, feature).then((loaded) => {
      if (cancelled) return;
      setMessages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, feature]);

  return messages;
}
