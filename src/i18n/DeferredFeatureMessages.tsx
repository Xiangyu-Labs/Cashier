"use client";
import { useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, useMessages, useTranslations } from "next-intl";
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
  const parentMessages = useMessages();
  const tCommon = useTranslations("Common");
  const featureState = useFeatureMessages(
    locale,
    feature,
    parentMessages as Record<string, unknown>
  );
  const merged = useMemo(
    () => (featureState.data == null ? null : { ...parentMessages, ...featureState.data }),
    [featureState.data, parentMessages]
  );

  if (featureState.status === "loading") return <>{fallback}</>;
  if (featureState.status === "error" || featureState.data == null) {
    return (
      <div
        role="alert"
        className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-6 text-center text-sm text-text"
      >
        <span>{tCommon("error")}</span>
        <button
          type="button"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={featureState.retry}
        >
          {tCommon("retry")}
        </button>
      </div>
    );
  }

  return (
    <NextIntlClientProvider messages={merged!} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
