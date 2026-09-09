import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("precaches only immutable static assets and guards automatic activation", () => {
    const config = read("next.config.ts");
    const worker = read("src/service-worker.ts");
    expect(config).toContain('withSerwistInit from "@serwist/next"');
    expect(config).toContain("cacheOnNavigation: false");
    expect(config).toContain("/chunks\\/app\\/api\\//");
    expect(config).not.toContain("/chunks\\/app\\/.*\\(protected\\)\\//");
    expect(config).not.toContain("additionalPrecacheEntries");
    expect(config).not.toContain("/offline");
    expect(worker).toContain("new Serwist");
    expect(worker).toContain("precacheEntries: self.__SW_MANIFEST");
    expect(worker).toContain("skipWaiting: false");
    expect(worker).toContain('type === "ACTIVATE_SINGLE_WINDOW"');
    expect(worker).toContain("clientsClaim: true");
    expect(worker).not.toContain("navigate");
    expect(worker).not.toContain("offline");
    expect(worker).not.toContain("fetchNavigation");
    expect(worker).not.toContain("caches.match");
    expect(read("src/components/ServiceWorkerUpdate.tsx")).toContain("controllerchange");
    expect(worker).toContain('type === "GET_WINDOW_COUNT"');
    expect(worker).toContain("count === 1");
  });
});
