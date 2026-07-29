import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("keeps authenticated navigation out of persistent service-worker caches", () => {
    const config = read("next.config.ts");
    const worker = read("worker/index.ts");
    expect(config).toContain('document: "/offline.html"');
    expect(config).toContain("runtimeCaching: []");
    expect(worker).toContain("NAVIGATION_TIMEOUT_MS = 5000");
    expect(worker).toContain('caches.match("/offline.html"');
    expect(worker).not.toContain("caches.put");
    expect(config).not.toContain("cacheStartUrl: true");
  });

  it("keeps protected stored files out of the browser HTTP cache", () => {
    expect(read("src/app/api/stored-files/[fileId]/route.ts")).toContain('"private, no-store"');
  });

  it("ships an offline reader without offline mutation controls", () => {
    const offline = read("public/offline.html");
    expect(offline).toContain("cashier.offline.activeSnapshot");
    expect(offline).toContain("Offline read-only");
    expect(offline).not.toContain("<form");
    expect(offline).not.toContain("fetch(");
  });
});
