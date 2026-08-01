import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("keeps authenticated navigation out of persistent service-worker caches", () => {
    const config = read("next.config.ts");
    const worker = read("worker/index.ts");
    expect(config).toContain('withSerwistInit from "@serwist/next"');
    expect(config).toContain('url: "/zh/offline"');
    expect(config).toContain('url: "/en/offline"');
    expect(config).toContain("cacheOnNavigation: false");
    expect(config).toContain("/chunks\\/app\\/api\\//");
    expect(config).toContain("/chunks\\/app\\/.*\\(protected\\)\\//");
    expect(worker).toContain("NAVIGATION_TIMEOUT_MS = 8_000");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("handler: ({ request }) => fetchNavigation(request)");
    expect(worker).toContain("caches.match(fallbackUrl");
    expect(worker).toContain("/\\/offline\\/?$/.test");
    expect(worker).not.toContain("caches.put");
    expect(config).not.toContain("next-pwa");
    expect(config).not.toContain("cacheStartUrl: true");
  });

  it("uses locale-specific installed-app entry points", () => {
    const manifest = read("src/app/[locale]/manifest.webmanifest/route.ts");
    const layout = read("src/app/[locale]/layout.tsx");
    expect(manifest).toContain("start_url: `/${locale}`");
    expect(manifest).toContain("scope: `/${locale}/`");
    expect(layout).toContain("manifest: `/${locale}/manifest.webmanifest`");
    const navigation = read("src/modules/offline/OfflineNavigation.tsx");
    expect(navigation).toContain('status === "online" || status === "recovered"');
    expect(navigation).toContain("returnUrl.current ?? `/${locale}`");
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

  it("keeps server-rendered snapshot keys outside the client IndexedDB module", () => {
    const activeTab = read("src/app/[locale]/(protected)/_active-tab.tsx");
    expect(activeTab).toContain('from "@/modules/offline/offline-constants"');
    expect(activeTab).not.toContain('from "@/modules/offline/offline-store"');
  });

  it("keeps checking content online and uses a connection-aware streaming fallback", () => {
    const shell = read("src/app/[locale]/(protected)/_active-shell.tsx");
    const client = read("src/modules/workspace/ui/LedgerPageClient.tsx");
    const activeTab = read("src/app/[locale]/(protected)/_active-tab.tsx");
    const fallback = read("src/modules/offline/ConnectionAwareLedgerFallback.tsx");
    expect(shell).toContain('status === "offline"');
    expect(shell).not.toContain('status === "offline" || status === "checking"');
    expect(client).toContain('connectionStatus === "offline"');
    expect(activeTab).toContain("ConnectionAwareLedgerFallback");
    expect(fallback).toContain('networkStatus === "offline"');
    expect(fallback).toContain("EntriesTabSkeleton");
  });
});
