interface ServiceWorkerFetchEvent extends Event {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
  addEventListener(type: "fetch", listener: (event: ServiceWorkerFetchEvent) => void): void;
}

const workerScope = globalThis as unknown as ServiceWorkerScope;
const NAVIGATION_TIMEOUT_MS = 5000;

async function fetchNavigation(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch {
    return (await caches.match("/offline.html", { ignoreSearch: true })) ?? Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

workerScope.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.mode === "navigate") {
    event.respondWith(fetchNavigation(event.request));
  }
});
