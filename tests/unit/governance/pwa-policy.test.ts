import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("uses the operating-system font stack without next/font", () => {
    const layout = read("src/app/[locale]/layout.tsx");
    const globals = read("src/app/globals.css");
    expect(layout).not.toContain("next/font/google");
    expect(globals).toContain(
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC"'
    );
    expect(globals).toContain('"Hiragino Sans GB"');
    expect(globals).toContain('"Microsoft YaHei", sans-serif');
  });

  it("precaches only immutable static assets and keeps the update prompt", () => {
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
    expect(worker).toContain('type === "SKIP_WAITING"');
    expect(worker).toContain("clientsClaim: true");
    expect(worker).not.toContain("navigate");
    expect(worker).not.toContain("offline");
    expect(worker).not.toContain("fetchNavigation");
    expect(worker).not.toContain("caches.match");
    expect(read("src/components/ServiceWorkerUpdate.tsx")).toContain("controllerchange");
    expect(read("src/components/ServiceWorkerUpdate.tsx")).not.toContain("document.activeElement");
  });

  it("loads document images through the authenticated no-store route", () => {
    const rawEvidence = read(
      "src/modules/source-document/ui/SourceDocumentViewDetails/components/SourceDocumentRawEvidence.tsx"
    );
    expect(rawEvidence).toContain("storedFileReadUrl");
    expect(rawEvidence).toContain("storedFileId: file.id");
    expect(rawEvidence).not.toContain("blob:");
  });

  it("keeps protected stored files out of the browser HTTP cache", () => {
    expect(read("src/app/api/stored-files/[fileId]/route.ts")).toContain('"private, no-store"');
  });
});
