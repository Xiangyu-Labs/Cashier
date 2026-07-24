"use client";
import type { ReactNode } from "react";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { useFeatureMessages } from "./use-feature-messages";

interface DeferredFeatureMessagesProps {
  feature: "shell" | "stream" | "details" | "stats" | "settings";
  locale: string;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Wraps children in a NextIntlClientProvider that loads locale messages
 * for the given feature asynchronously. Shows `fallback` while loading.
 *
 * Merges the lazy-loaded feature messages on top of the parent messages
 * so the feature gets its namespaces without losing shell/global ones.
 *
 * Passes the `locale` prop explicitly to NextIntlClientProvider.
 *
 * Use this inside dynamic imports for inactive tabs so their translations
 * are fetched as a separate chunk rather than bundled with the initial page.
 */
export function DeferredFeatureMessages({
  feature,
  locale,
  fallback,
  children,
}: DeferredFeatureMessagesProps) {
  const featureMessages = useFeatureMessages(locale, feature);
  const parentMessages = useMessages();

  if (!featureMessages) return <>{fallback}</>;

  // Merge feature messages on top of parent messages so the feature
  // gets its namespaces without losing shell/global ones.
  const merged = { ...parentMessages, ...featureMessages };

  return (
    <NextIntlClientProvider messages={merged} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
