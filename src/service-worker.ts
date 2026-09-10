/// <reference lib="webworker" />

import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  disableDevLogs: true,
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  const type = (event.data as { type?: string } | null)?.type;
  if (type !== "GET_WINDOW_COUNT" && type !== "ACTIVATE_SINGLE_WINDOW" && type !== "ACTIVATE_NOW") {
    return;
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const count = windows.filter((client) =>
        client.url.startsWith(self.registration.scope)
      ).length;
      if (type === "GET_WINDOW_COUNT") event.ports[0]?.postMessage(count);
      if (type === "ACTIVATE_SINGLE_WINDOW" && count === 1) await self.skipWaiting();
      if (type === "ACTIVATE_NOW") await self.skipWaiting();
    })()
  );
});
