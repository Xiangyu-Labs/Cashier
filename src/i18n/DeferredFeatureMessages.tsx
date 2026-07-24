"use client";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useFeatureMessages } from "./use-feature-messages";

interface DeferredFeatureMessagesProps {
  feature: "shell" | "stream" | "details" | "stats" | "settings";
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Wraps children in a NextIntlClientProvider that loads locale messages
 * for the given feature asynchronously. Shows `fallback` while loading.
 *
 * Use this inside dynamic imports for inactive tabs so their translations
 * are fetched as a separate chunk rather than bundled with the initial page.
 */
export function DeferredFeatureMessages({
  feature,
  fallback,
  children,
}: DeferredFeatureMessagesProps) {
  const messages = useFeatureMessages(feature);
  if (!messages) return <>{fallback}</>;
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
