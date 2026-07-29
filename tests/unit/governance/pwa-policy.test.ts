import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("keeps authenticated navigation out of persistent service-worker caches", () => {
    const config = read("next.config.ts");
    const worker = read("worker/index.ts");
    expect(config).toContain('document: "/zh/offline"');
    expect(config).toContain('url: "/en/offline"');
    expect(config).toContain("runtimeCaching: []");
    expect(worker).toContain("NAVIGATION_TIMEOUT_MS = 5000");
    expect(worker).toContain("caches.match(`/${locale}/offline`");
    expect(worker).not.toContain("caches.put");
    expect(config).not.toContain("cacheStartUrl: true");
  });

  it("keeps protected stored files out of the browser HTTP cache", () => {
    expect(read("src/app/api/stored-files/[fileId]/route.ts")).toContain('"private, no-store"');
  });

  it("keeps the database-free health probe and retired v2 paths outside session auth", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain("api/health|api/v2");
  });

  it("ships an offline reader without offline mutation controls", () => {
    const offline = read("src/modules/offline/OfflineLedgerView.tsx");
    const card = read("src/modules/source-document/ui/SourceDocumentCard.tsx");
    expect(offline).toContain("readOfflineSnapshot");
    expect(offline).toContain("readOnly");
    expect(card).toContain("READ_ONLY_RECOVERY");
    expect(offline).not.toContain("useMutation");
  });
});
