"use client";
import { useEffect, useState } from "react";
import { pickMessages, FEATURE_MESSAGES } from "./client-feature-messages";

// Static import map per locale — each import path is explicit so bundlers
// can analyze it statically and create separate chunks.
const MESSAGE_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  en: () => import("../../messages/en.json").then((m) => m.default as Record<string, unknown>),
  zh: () => import("../../messages/zh.json").then((m) => m.default as Record<string, unknown>),
};

const messagePromises = new Map<string, Promise<Record<string, unknown>>>();

export function preloadFeatureMessages(locale: string): Promise<Record<string, unknown>> {
  const normalizedLocale = MESSAGE_LOADERS[locale] != null ? locale : "en";
  const existing = messagePromises.get(normalizedLocale);
  if (existing != null) return existing;
  const promise = MESSAGE_LOADERS[normalizedLocale]!();
  messagePromises.set(normalizedLocale, promise);
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
    preloadFeatureMessages(locale).then((full) => {
      if (cancelled) return;
      setMessages(pickMessages(full, FEATURE_MESSAGES[feature]));
    });
    return () => {
      cancelled = true;
    };
  }, [locale, feature]);

  return messages;
}
