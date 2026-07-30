interface ServiceWorkerFetchEvent extends Event {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
  addEventListener(type: "fetch", listener: (event: ServiceWorkerFetchEvent) => void): void;
}

const workerScope = globalThis as unknown as ServiceWorkerScope;
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

workerScope.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.mode === "navigate") {
    event.respondWith(fetchNavigation(event.request));
  }
});
