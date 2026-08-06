import { describe, expect, it, vi, beforeEach } from "vitest";

const clientCache = vi.hoisted(() => ({
  clearUserCacheDataSafely: vi.fn(async () => true),
  getActiveStartupCacheKey: vi.fn<() => string | null>(() => null),
}));
const store = vi.hoisted(() => ({
  readLedgerStartupSnapshot: vi.fn(),
  replaceLedgerStartupSnapshot: vi.fn<(snapshot: unknown) => Promise<void>>(async () => {}),
}));
const serverActions = vi.hoisted(() => ({
  getLedgerStartupCacheVersion: vi.fn(),
  getLedgerStartupCacheSnapshot: vi.fn(),
}));
const sourceActions = vi.hoisted(() => ({
  getStreamRefreshAction: vi.fn(),
}));

vi.mock("@/lib/client-cache", () => clientCache);
vi.mock("@/modules/workspace/ledger-startup-cache-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/workspace/ledger-startup-cache-store")>();
  return {
    ...actual,
    readLedgerStartupSnapshot: store.readLedgerStartupSnapshot,
    replaceLedgerStartupSnapshot: store.replaceLedgerStartupSnapshot,
  };
});
vi.mock("@/modules/workspace/server-actions/ledger-startup-cache", () => serverActions);
vi.mock("@/modules/source-document/actions", () => sourceActions);

import {
  syncStartupCache,
  type LedgerStartupCacheSyncProps,
} from "@/modules/workspace/ledger-startup-cache-sync";
import type { LedgerStartupCacheSnapshot } from "@/modules/workspace/ledger-startup-cache-store";

const props: LedgerStartupCacheSyncProps = {
  userId: "user",
  ledgerId: "ledger",
  locale: "zh",
  mainCurrency: "CNY",
  timeZone: "Asia/Shanghai",
  collapseEntriesDefault: false,
  preferredCurrencies: ["CNY"],
  categories: [],
};

function previous(overrides: Partial<LedgerStartupCacheSnapshot> = {}): LedgerStartupCacheSnapshot {
  const now = new Date().toISOString();
  return {
    key: "user:ledger",
    schemaVersion: 1,
    userId: "user",
    ledgerId: "ledger",
    locale: "zh",
    mainCurrency: "CNY",
    preferredCurrencies: ["CNY"],
    categories: [],
    ledgerSettings: { timeZone: "Asia/Shanghai", collapseEntriesDefault: false },
    items: [],
    syncVersion: "2",
    recordCount: 0,
    complete: true,
    truncated: false,
    coverageLimit: 1000,
    lastSyncedAt: now,
    fullSyncAt: now,
    ...overrides,
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    version: "4",
    recordCount: 0,
    complete: true,
    truncated: false,
    coverageLimit: 1000,
    ...overrides,
  };
}

function delta(toVersion: string, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 2,
    fromVersion: "2",
    toVersion,
    hasMore: false,
    resetRequired: false,
    changed: true,
    hasTransitionalWork: false,
    documents: [],
    tombstones: [],
    counts: null,
    invalidations: { categories: false, settings: false, stats: false },
    ...overrides,
  };
}

describe("syncStartupCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientCache.getActiveStartupCacheKey.mockReturnValue(null);
    store.readLedgerStartupSnapshot.mockResolvedValue(null);
    serverActions.getLedgerStartupCacheVersion.mockResolvedValue(version());
    serverActions.getLedgerStartupCacheSnapshot.mockResolvedValue({
      ...version(),
      items: [],
      generatedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("downloads a full snapshot on first run", async () => {
    await syncStartupCache(props, new AbortController().signal);
    expect(serverActions.getLedgerStartupCacheSnapshot).toHaveBeenCalledWith("ledger", "4");
    expect(store.replaceLedgerStartupSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "user:ledger",
        userId: "user",
        syncVersion: "4",
        fullSyncAt: "2026-08-02T00:00:00.000Z",
      })
    );
  });

  it("does nothing when the version is unchanged and fresh", async () => {
    serverActions.getLedgerStartupCacheVersion.mockResolvedValue(version({ version: "2" }));
    store.readLedgerStartupSnapshot.mockResolvedValue(previous());
    await syncStartupCache(props, new AbortController().signal);
    expect(store.replaceLedgerStartupSnapshot).not.toHaveBeenCalled();
    expect(serverActions.getLedgerStartupCacheSnapshot).not.toHaveBeenCalled();
    expect(sourceActions.getStreamRefreshAction).not.toHaveBeenCalled();
  });

  it("refreshes metadata only when the version is unchanged", async () => {
    serverActions.getLedgerStartupCacheVersion.mockResolvedValue(version({ version: "2" }));
    store.readLedgerStartupSnapshot.mockResolvedValue(
      previous({ locale: "en", mainCurrency: "USD" })
    );
    await syncStartupCache(props, new AbortController().signal);
    expect(store.replaceLedgerStartupSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "zh", mainCurrency: "CNY" })
    );
  });

  it("merges ledger deltas and replaces the snapshot atomically", async () => {
    const oldItem = { id: "old" } as LedgerStartupCacheSnapshot["items"][number];
    const newItem = { id: "new" } as LedgerStartupCacheSnapshot["items"][number];
    serverActions.getLedgerStartupCacheVersion.mockResolvedValue(version({ recordCount: 1 }));
    store.readLedgerStartupSnapshot.mockResolvedValue(
      previous({ items: [oldItem], recordCount: 1 })
    );
    sourceActions.getStreamRefreshAction.mockResolvedValue(
      delta("4", { documents: [newItem], tombstones: ["old"] })
    );
    await syncStartupCache(props, new AbortController().signal);
    expect(sourceActions.getStreamRefreshAction).toHaveBeenCalledWith("ledger", {
      ledgerId: "ledger",
      afterVersion: "2",
    });
    expect(store.replaceLedgerStartupSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ syncVersion: "4", recordCount: 1 })
    );
    const replaced = store.replaceLedgerStartupSnapshot.mock.calls[0]![0] as unknown as {
      items: Array<{ id: string }>;
    };
    expect(replaced.items.map((item) => item.id)).toEqual(["new"]);
  });

  it("performs a full validation when resetRequired is returned", async () => {
    store.readLedgerStartupSnapshot.mockResolvedValue(previous());
    sourceActions.getStreamRefreshAction.mockResolvedValue(delta("4", { resetRequired: true }));
    await syncStartupCache(props, new AbortController().signal);
    expect(serverActions.getLedgerStartupCacheSnapshot).toHaveBeenCalledWith("ledger", "4");
    expect(store.replaceLedgerStartupSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ syncVersion: "4", fullSyncAt: "2026-08-02T00:00:00.000Z" })
    );
  });

  it("performs a full validation after 24 hours", async () => {
    serverActions.getLedgerStartupCacheVersion.mockResolvedValue(version({ version: "2" }));
    store.readLedgerStartupSnapshot.mockResolvedValue(
      previous({ fullSyncAt: "2020-01-01T00:00:00.000Z" })
    );
    await syncStartupCache(props, new AbortController().signal);
    expect(sourceActions.getStreamRefreshAction).not.toHaveBeenCalled();
    expect(serverActions.getLedgerStartupCacheSnapshot).toHaveBeenCalled();
  });

  it("clears stale user data when the active cache belongs to another user", async () => {
    clientCache.getActiveStartupCacheKey.mockReturnValue("other:ledger");
    await syncStartupCache(props, new AbortController().signal);
    expect(clientCache.clearUserCacheDataSafely).toHaveBeenCalledWith(
      undefined,
      props,
      "Failed to clear startup cache during user switch"
    );
  });

  it("does not replace the snapshot after the signal aborts", async () => {
    const controller = new AbortController();
    serverActions.getLedgerStartupCacheVersion.mockImplementation(async () => {
      controller.abort();
      return version();
    });
    await syncStartupCache(props, controller.signal);
    expect(store.replaceLedgerStartupSnapshot).not.toHaveBeenCalled();
  });

  it("retries snapshot conflicts twice and preserves the old snapshot when still conflicting", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const conflict = new Error("snapshot changed");
      (conflict as Error & { code?: string }).code = "CONFLICT";
      serverActions.getLedgerStartupCacheSnapshot.mockRejectedValue(conflict);

      const promise = syncStartupCache(props, controller.signal);
      const rejection = expect(promise).rejects.toThrow("snapshot changed");
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(300);

      await rejection;
      expect(serverActions.getLedgerStartupCacheSnapshot).toHaveBeenCalledTimes(3);
      expect(serverActions.getLedgerStartupCacheVersion).toHaveBeenCalledTimes(3);
      expect(store.replaceLedgerStartupSnapshot).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
