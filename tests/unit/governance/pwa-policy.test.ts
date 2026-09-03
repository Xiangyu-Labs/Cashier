import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => existsSync(resolve(root, path));

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = resolve(directory, entry);
    return statSync(absolute).isDirectory()
      ? collectSourceFiles(absolute)
      : /\.(ts|tsx)$/.test(entry)
        ? [absolute]
        : [];
  });
}

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

  it("removes the offline mode, offline route, health probe, and connection UI", () => {
    expect(exists("src/modules/offline")).toBe(false);
    expect(exists("src/app/[locale]/offline")).toBe(false);
    expect(exists("src/app/api/health")).toBe(false);
    expect(read("src/proxy.ts")).not.toContain("api/health");
    expect(read("src/components/providers.tsx")).not.toContain("ConnectionStateProvider");
    expect(read("src/modules/workspace/ui/AppShell.tsx")).not.toContain("ConnectionBanner");
    expect(read("src/modules/workspace/ui/TabNavigation.tsx")).not.toContain("offline?");
    expect(read("src/app/[locale]/(protected)/_active-shell.tsx")).not.toContain(
      'status === "offline"'
    );
    const sourceFiles = collectSourceFiles(resolve(root, "src"));
    for (const file of sourceFiles) {
      const relative = file.slice(root.length + 1);
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain('from "@/modules/offline/');
      expect(source).not.toContain("offlineImageUrls");
      expect(source).not.toContain("cashier:offline-snapshot");
      expect(relative).not.toContain("/offline/");
    }
  });

  it("uses tab-specific skeletons instead of a persisted startup preview", () => {
    const fallback = read("src/app/[locale]/(protected)/_ledger-bootstrap-fallback.tsx");
    expect(fallback).toContain("EntriesTabSkeleton");
    expect(fallback).toContain("DetailsTabSkeleton");
    expect(fallback).toContain("StatsTabSkeleton");
    expect(fallback).toContain("SettingsTabSkeleton");
    expect(fallback).not.toContain("IndexedDB");
    expect(fallback).not.toContain("useMutation");
    expect(exists("src/modules/workspace/ui/LedgerStartupPreview.tsx")).toBe(false);
  });

  it("keeps startup snapshots out of the active ledger shell", () => {
    const activeTab = read("src/app/[locale]/(protected)/_active-tab.tsx");
    const pageClient = read("src/modules/workspace/ui/LedgerPageClient.tsx");
    expect(pageClient).not.toContain("ledgerStartupCacheKey");
    expect(pageClient).not.toContain("LedgerStartupCacheSync");
    expect(activeTab).not.toContain("ledger-startup-cache-store");
  });

  it("loads document images through the authenticated no-store route", () => {
    const providers = read("src/components/providers.tsx");
    const legacyCleanup = read("src/lib/legacy-client-cache-cleanup.ts");
    const viewDetails = read("src/modules/source-document/ui/SourceDocumentViewDetails.tsx");
    const rawEvidence = read(
      "src/modules/source-document/ui/SourceDocumentViewDetails/components/SourceDocumentRawEvidence.tsx"
    );
    expect(exists("src/lib/client-cache/index.ts")).toBe(false);
    expect(exists("src/modules/source-document/image-cache.ts")).toBe(false);
    expect(exists("src/modules/source-document/hooks/use-cached-source-images.ts")).toBe(false);
    expect(providers).toContain("deleteLegacyClientCache");
    expect(legacyCleanup).toContain('LEGACY_CLIENT_CACHE_DATABASE = "cashier-cache"');
    expect(legacyCleanup).toContain("indexedDB.deleteDatabase");
    expect(legacyCleanup).not.toContain("indexedDB.open");
    expect(legacyCleanup).not.toContain("documentImages");
    expect(viewDetails).not.toContain("cachedImageUrls");
    expect(rawEvidence).toContain("storedFileReadUrl");
    expect(rawEvidence).toContain("storedFileId: file.id");
    expect(rawEvidence).not.toContain("blob:");
  });

  it("keeps protected stored files out of the browser HTTP cache", () => {
    expect(read("src/app/api/stored-files/[fileId]/route.ts")).toContain('"private, no-store"');
  });
});
