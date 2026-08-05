import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_IMAGE_STORE,
  LEDGER_SNAPSHOT_STORE,
  getActiveStartupCacheKey,
  openCacheDb,
  requestResult,
  setActiveStartupCacheKey,
  transactionDone,
} from "@/lib/client-cache";
import {
  mergeLedgerStartupDeltaItems,
  readLedgerStartupSnapshot,
  writeLedgerStartupSnapshot,
  type LedgerStartupCacheSnapshot,
} from "@/modules/workspace/ledger-startup-cache-store";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

function document(id: string, entryDate: string): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger",
    type: "manual",
    status: "completed",
    title: id,
    text: null,
    anomalyReason: null,
    entryDate,
    metadata: {},
    createdAt: `${entryDate}T00:00:00.000Z`,
    updatedAt: `${entryDate}T00:00:00.000Z`,
    deletedAt: null,
    files: [],
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
}

function snapshot(overrides: Partial<LedgerStartupCacheSnapshot> = {}): LedgerStartupCacheSnapshot {
  return {
    key: "user:ledger",
    schemaVersion: 1,
    userId: "user",
    ledgerId: "ledger",
    items: [],
    syncVersion: "1",
    recordCount: 0,
    complete: true,
    truncated: false,
    coverageLimit: 1000,
    lastSyncedAt: "2026-08-01T00:00:00.000Z",
    fullSyncAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("startup snapshot schema", () => {
  it("writes and reads a snapshot with the current schema", async () => {
    const item = document("a", "2026-08-01");
    await writeLedgerStartupSnapshot(snapshot({ items: [item], syncVersion: "7", recordCount: 1 }));

    const read = await readLedgerStartupSnapshot("user:ledger");
    expect(read).toEqual(
      expect.objectContaining({
        key: "user:ledger",
        schemaVersion: 1,
        items: [item],
        syncVersion: "7",
        recordCount: 1,
      })
    );
  });

  it("returns a cache miss and cleans up when the stored snapshot uses another schema", async () => {
    setActiveStartupCacheKey("user:ledger");
    const db = await openCacheDb();
    const tx = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readwrite");
    tx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [document("old", "2026-07-30")],
      viewedItems: [document("viewed", "2026-07-31")],
    });
    tx.objectStore(DOCUMENT_IMAGE_STORE).put({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      userId: "user",
      fileId: "file-1",
      documentId: "doc-1",
      contentType: "image/png",
      byteSize: 1,
      blob: new Blob(["x"]),
      lastAccessedAt: 1,
    });
    tx.objectStore(DOCUMENT_IMAGE_STORE).put({
      key: "other:ledger:file-2",
      snapshotKey: "other:ledger",
      userId: "other",
      fileId: "file-2",
      documentId: "doc-2",
      contentType: "image/png",
      byteSize: 1,
      blob: new Blob(["y"]),
      lastAccessedAt: 1,
    });
    await transactionDone(tx);

    await expect(readLedgerStartupSnapshot("user:ledger")).resolves.toBeNull();

    const verify = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readonly");
    const snapshots = await requestResult(
      verify.objectStore(LEDGER_SNAPSHOT_STORE).getAll() as IDBRequest<unknown[]>
    );
    const images = await requestResult(
      verify.objectStore(DOCUMENT_IMAGE_STORE).getAll() as IDBRequest<Array<{ key: string }>>
    );
    expect(snapshots).toEqual([]);
    expect(images.map((image) => image.key)).toEqual(["other:ledger:file-2"]);
    expect(getActiveStartupCacheKey()).toBeNull();
  });

  it("treats a snapshot without a schema version as a cache miss", async () => {
    const db = await openCacheDb();
    const tx = db.transaction(LEDGER_SNAPSHOT_STORE, "readwrite");
    tx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "user:ledger",
      userId: "user",
      ledgerId: "ledger",
      items: [],
    });
    await transactionDone(tx);

    await expect(readLedgerStartupSnapshot("user:ledger")).resolves.toBeNull();

    const verify = db.transaction(LEDGER_SNAPSHOT_STORE, "readonly");
    const snapshots = await requestResult(
      verify.objectStore(LEDGER_SNAPSHOT_STORE).getAll() as IDBRequest<unknown[]>
    );
    expect(snapshots).toEqual([]);
  });
});

describe("startup delta merge", () => {
  it("applies canonical replacements and tombstones in server order", () => {
    const replacement = { ...document("b", "2026-08-03"), title: "updated" };
    const merged = mergeLedgerStartupDeltaItems(
      [document("a", "2026-08-01"), document("b", "2026-08-02")],
      { documents: [replacement, document("c", "2026-08-04")], tombstones: ["a"] },
      1000
    );
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
    expect(merged[1]?.title).toBe("updated");
  });

  it("truncates incremental results to snapshot coverage", () => {
    const merged = mergeLedgerStartupDeltaItems(
      [document("a", "2026-08-01"), document("b", "2026-08-02")],
      { documents: [document("c", "2026-08-03")], tombstones: [] },
      2
    );
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
  });
});
