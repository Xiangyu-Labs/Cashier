/// <reference lib="webworker" />

import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: ServiceWorkerGlobalScope;

const NAVIGATION_TIMEOUT_MS = 8_000;

function offlineEntry(request: Request) {
  const locale = new URL(request.url).pathname.startsWith("/en/") ? "en" : "zh";
  return `/${locale}/offline`;
}

async function fetchNavigation(request: Request): Promise<Response> {
  const fallbackUrl = offlineEntry(request);
  if (/\/offline\/?$/.test(new URL(request.url).pathname)) {
    const cached = await caches.match(fallbackUrl, { ignoreSearch: true });
    if (cached != null) return cached;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch {
    return (await caches.match(fallbackUrl, { ignoreSearch: true })) ?? Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.method === "GET" && request.mode === "navigate",
      handler: ({ request }) => fetchNavigation(request),
    },
  ],
});

serwist.addEventListeners();
