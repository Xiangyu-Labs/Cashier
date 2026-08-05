import { describe, expect, it } from "vitest";
import {
  ACTIVE_STARTUP_CACHE_KEY,
  clearUserCacheData,
  getActiveStartupCacheKey,
  migrateLegacyOfflineCache,
  normalizeLegacyImageRecord,
  normalizeLegacySnapshotRecord,
  openCacheDb,
} from "@/lib/client-cache";

describe("client cache lifecycle", () => {
  it("returns null active cache key when localStorage is unavailable", () => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_STARTUP_CACHE_KEY);
    expect(getActiveStartupCacheKey()).toBeNull();
  });

  it("falls back to an empty cache when migration cannot run", async () => {
    await expect(migrateLegacyOfflineCache()).resolves.toBe(false);
  });

  it("clears nothing when IndexedDB is unavailable", async () => {
    await expect(clearUserCacheData("user")).resolves.toBeUndefined();
  });

  it("rejects cache opening when IndexedDB is unavailable", async () => {
    await expect(openCacheDb()).rejects.toThrow("IndexedDB is unavailable");
  });

  it("normalizes a legacy v5 snapshot without data loss", () => {
    const normalized = normalizeLegacySnapshotRecord({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [{ id: "doc" }],
      syncVersion: "7",
      recordCount: 1,
      complete: true,
      truncated: false,
      coverageLimit: 1000,
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
      fullSyncAt: "2026-08-01T00:00:00.000Z",
    });
    expect(normalized).toMatchObject({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [{ id: "doc" }],
      syncVersion: "7",
      coverageLimit: 1000,
    });
  });

  it("defaults missing legacy snapshot metadata", () => {
    const normalized = normalizeLegacySnapshotRecord({
      key: "user:ledger",
      userId: "user",
      ledgerId: "ledger",
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(normalized.schemaVersion).toBe(5);
    expect(normalized.items).toEqual([]);
    expect(normalized.lastSyncedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("drops legacy viewedItems copies during migration", () => {
    const normalized = normalizeLegacySnapshotRecord({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [{ id: "doc" }],
      viewedItems: [{ id: "viewed" }],
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(normalized).not.toHaveProperty("viewedItems");
  });

  it("normalizes a legacy image record with the user derived from the snapshot key", () => {
    const normalized = normalizeLegacyImageRecord({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      fileId: "file-1",
      documentId: "doc-1",
      contentType: "image/webp",
      byteSize: 1024,
      blob: new Blob(["x"]),
      viewed: false,
      priorityAt: 1,
      lastAccessedAt: 10,
    });
    expect(normalized).toMatchObject({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      userId: "user",
      fileId: "file-1",
      lastAccessedAt: 10,
    });
    expect(normalized).not.toHaveProperty("viewed");
    expect(normalized).not.toHaveProperty("priorityAt");
  });
});
