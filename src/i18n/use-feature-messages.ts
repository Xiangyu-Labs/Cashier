"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { FEATURE_MESSAGES, pickMessages } from "./client-feature-messages";
import { FEATURE_MESSAGE_VERSION } from "./feature-message-version";

export type FeatureMessageStatus = "loading" | "success" | "error";

export interface FeatureMessagesState {
  status: FeatureMessageStatus;
  data: Record<string, unknown> | null;
  messages: Record<string, unknown> | null;
  error: Error | null;
  retry: () => void;
}

interface CachedFeatureMessages {
  status: FeatureMessageStatus;
  messages: Record<string, unknown> | null;
  error: Error | null;
  promise?: Promise<Record<string, unknown>>;
  requestId?: symbol;
}

const EMPTY_CACHE_STATE: CachedFeatureMessages = {
  status: "loading",
  messages: null,
  error: null,
};
const featureMessageCache = new Map<string, CachedFeatureMessages>();
const featureMessageListeners = new Map<string, Set<() => void>>();

function notifyFeatureMessageListeners(cacheKey: string) {
  featureMessageListeners.get(cacheKey)?.forEach((listener) => listener());
}

function subscribeToFeatureMessages(cacheKey: string, listener: () => void) {
  let listeners = featureMessageListeners.get(cacheKey);
  if (listeners == null) {
    listeners = new Set();
    featureMessageListeners.set(cacheKey, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) featureMessageListeners.delete(cacheKey);
  };
}

function featureCacheKey(locale: string, feature: keyof typeof FEATURE_MESSAGES) {
  const normalizedLocale = locale === "zh" ? "zh" : "en";
  return `${normalizedLocale}:${feature}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function startFeatureMessageLoad(
  locale: string,
  feature: keyof typeof FEATURE_MESSAGES,
  cacheKey: string
): Promise<Record<string, unknown>> {
  const requestId = Symbol(cacheKey);
  const promise = fetch(
    `/api/i18n/${locale === "zh" ? "zh" : "en"}/${feature}?v=${FEATURE_MESSAGE_VERSION}`,
    {
      credentials: "same-origin",
      cache: "force-cache",
    }
  ).then(async (response) => {
    if (!response.ok) throw new Error("Unable to load feature messages");
    return (await response.json()) as Record<string, unknown>;
  });

  featureMessageCache.set(cacheKey, {
    status: "loading",
    messages: null,
    error: null,
    promise,
    requestId,
  });
  notifyFeatureMessageListeners(cacheKey);

  // Attach the cache update separately so callers can still observe the
  // rejection, while an unobserved preload never becomes an unhandled
  // rejection.
  void promise.then(
    (messages) => {
      const current = featureMessageCache.get(cacheKey);
      if (current?.requestId !== requestId) return;
      featureMessageCache.set(cacheKey, {
        status: "success",
        messages,
        error: null,
      });
      notifyFeatureMessageListeners(cacheKey);
    },
    (error: unknown) => {
      const current = featureMessageCache.get(cacheKey);
      if (current?.requestId !== requestId) return;
      featureMessageCache.set(cacheKey, {
        status: "error",
        messages: null,
        error: toError(error),
      });
      notifyFeatureMessageListeners(cacheKey);
    }
  );

  return promise;
}

export function preloadFeatureMessages(
  locale: string,
  feature: keyof typeof FEATURE_MESSAGES
): Promise<Record<string, unknown>> {
  const cacheKey = featureCacheKey(locale, feature);
  const cached = featureMessageCache.get(cacheKey);
  if (cached?.status === "success" && cached.messages != null) {
    return Promise.resolve(cached.messages);
  }
  if (cached?.status === "error") {
    return Promise.reject(cached.error ?? new Error("Unable to load feature messages"));
  }
  if (cached?.promise != null) return cached.promise;
  return startFeatureMessageLoad(locale, feature, cacheKey);
}

/**
 * Loads a subset of locale messages for a specific feature boundary.
 * Exposes the full loading/error/success state so a failed message request
 * cannot leave a feature mounted behind a permanent skeleton.
 *
 * @param locale - The current locale string (e.g. "en", "zh").
 * @param feature - The feature key whose namespaces to pick.
 * @param availableMessages - Messages already provided by an outer
 *   NextIntlClientProvider. This avoids refetching the initial tab's feature.
 */
export function useFeatureMessages(
  locale: string,
  feature: keyof typeof FEATURE_MESSAGES,
  availableMessages?: Record<string, unknown>
): FeatureMessagesState {
  const cacheKey = featureCacheKey(locale, feature);
  const namespaces = FEATURE_MESSAGES[feature];
  const availableFeatureMessages = useMemo(
    () =>
      availableMessages != null && namespaces.every((namespace) => namespace in availableMessages)
        ? pickMessages(availableMessages, namespaces)
        : null,
    [availableMessages, namespaces]
  );

  const subscribe = useCallback(
    (listener: () => void) => subscribeToFeatureMessages(cacheKey, listener),
    [cacheKey]
  );
  const getSnapshot = useCallback(
    () => featureMessageCache.get(cacheKey) ?? EMPTY_CACHE_STATE,
    [cacheKey]
  );
  const cached = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (availableFeatureMessages != null) return;
    void preloadFeatureMessages(locale, feature).catch(() => undefined);
  }, [availableFeatureMessages, feature, locale]);

  const retry = useCallback(() => {
    if (availableFeatureMessages != null) return;
    featureMessageCache.delete(cacheKey);
    notifyFeatureMessageListeners(cacheKey);
    void preloadFeatureMessages(locale, feature).catch(() => undefined);
  }, [availableFeatureMessages, cacheKey, feature, locale]);

  return useMemo(
    () =>
      availableFeatureMessages != null
        ? {
            status: "success" as const,
            data: availableFeatureMessages,
            messages: availableFeatureMessages,
            error: null,
            retry,
          }
        : {
            status: cached.status,
            data: cached.messages,
            messages: cached.messages,
            error: cached.error,
            retry,
          },
    [availableFeatureMessages, cached.error, cached.messages, cached.status, retry]
  );
}
