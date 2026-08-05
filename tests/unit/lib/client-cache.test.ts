import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_STARTUP_CACHE_KEY,
  CACHE_DB_NAME,
  CACHE_DB_VERSION,
  DOCUMENT_IMAGE_STORE,
  LEDGER_SNAPSHOT_STORE,
  clearUserCacheData,
  getActiveStartupCacheKey,
  openCacheDb,
  requestResult,
  transactionDone,
} from "@/lib/client-cache";

const LEGACY_DB_NAME = "cashier-offline";
const LEGACY_ACTIVE_KEY = "cashier.offline.activeSnapshot";

function openLegacyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, 5);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("snapshots", { keyPath: "key" });
      request.result.createObjectStore("images", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteLegacyDb(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Returns a fresh module instance so the single-execution guard resets. */
async function freshClientCache() {
  vi.resetModules();
  return await import("@/lib/client-cache");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe("client cache database", () => {
  it("rebuilds both stores when upgrading from v1 so old records are discarded", async () => {
    const seeded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const snapshots = db.createObjectStore(LEDGER_SNAPSHOT_STORE, { keyPath: "key" });
        snapshots.createIndex("userId", "userId", { unique: false });
        const images = db.createObjectStore(DOCUMENT_IMAGE_STORE, { keyPath: "key" });
        images.createIndex("snapshotKey", "snapshotKey", { unique: false });
        images.createIndex("userId", "userId", { unique: false });
        images.createIndex("snapshotAccess", ["snapshotKey", "lastAccessedAt"], {
          unique: false,
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const seedTx = seeded.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readwrite");
    seedTx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [],
    });
    seedTx.objectStore(DOCUMENT_IMAGE_STORE).put({
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
    await transactionDone(seedTx);
    seeded.close();

    const db = await openCacheDb();
    expect(CACHE_DB_VERSION).toBe(2);
    expect(db.version).toBe(CACHE_DB_VERSION);

    const tx = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readonly");
    const snapshots = await requestResult(
      tx.objectStore(LEDGER_SNAPSHOT_STORE).getAll() as IDBRequest<unknown[]>
    );
    const images = await requestResult(
      tx.objectStore(DOCUMENT_IMAGE_STORE).getAll() as IDBRequest<unknown[]>
    );
    expect(snapshots).toEqual([]);
    expect(images).toEqual([]);
  });

  it("clears user data and the active key for a specific user only", async () => {
    localStorage.setItem(ACTIVE_STARTUP_CACHE_KEY, "user:ledger");
    const db = await openCacheDb();
    const tx = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readwrite");
    tx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "user:ledger",
      schemaVersion: 1,
      userId: "user",
      ledgerId: "ledger",
      items: [],
    });
    tx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "other:ledger",
      schemaVersion: 1,
      userId: "other",
      ledgerId: "ledger",
      items: [],
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
    await transactionDone(tx);

    await clearUserCacheData("user");

    const verifyTx = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readonly");
    const remainingSnapshots = await requestResult(
      verifyTx.objectStore(LEDGER_SNAPSHOT_STORE).getAll() as IDBRequest<Array<{ key: string }>>
    );
    const remainingImages = await requestResult(
      verifyTx.objectStore(DOCUMENT_IMAGE_STORE).getAll() as IDBRequest<unknown[]>
    );
    expect(remainingSnapshots.map((snapshot) => snapshot.key)).toEqual(["other:ledger"]);
    expect(remainingImages).toEqual([]);
    expect(getActiveStartupCacheKey()).toBeNull();
  });

  it("clears everything when no user is given", async () => {
    const db = await openCacheDb();
    const tx = db.transaction(LEDGER_SNAPSHOT_STORE, "readwrite");
    tx.objectStore(LEDGER_SNAPSHOT_STORE).put({
      key: "other:ledger",
      schemaVersion: 1,
      userId: "other",
      ledgerId: "ledger",
      items: [],
    });
    await transactionDone(tx);

    await clearUserCacheData();

    const verifyTx = db.transaction(LEDGER_SNAPSHOT_STORE, "readonly");
    const snapshots = await requestResult(
      verifyTx.objectStore(LEDGER_SNAPSHOT_STORE).getAll() as IDBRequest<unknown[]>
    );
    expect(snapshots).toEqual([]);
  });
});

describe("legacy offline cache discard", () => {
  it("removes the legacy localStorage key and database without throwing", async () => {
    const legacyDb = await openLegacyDb();
    const seedTx = legacyDb.transaction("snapshots", "readwrite");
    seedTx.objectStore("snapshots").put({
      key: "user:ledger",
      userId: "user",
      ledgerId: "ledger",
      items: [],
    });
    await transactionDone(seedTx);
    legacyDb.close();
    localStorage.setItem(LEGACY_ACTIVE_KEY, "user:ledger");

    const { discardLegacyOfflineCache } = await freshClientCache();
    await expect(discardLegacyOfflineCache()).resolves.toBeUndefined();
    expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();

    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(LEGACY_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(reopened.version).toBe(1);
    expect(reopened.objectStoreNames.length).toBe(0);
    reopened.close();
    await deleteLegacyDb();
  });

  it("runs the deletion at most once per page load", async () => {
    const deleteSpy = vi.spyOn(indexedDB, "deleteDatabase");
    const { discardLegacyOfflineCache } = await freshClientCache();
    await discardLegacyOfflineCache();
    await discardLegacyOfflineCache();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    deleteSpy.mockRestore();
  });

  it("does not block or throw when deletion is blocked by an open connection", async () => {
    const legacyDb = await openLegacyDb();
    localStorage.setItem(LEGACY_ACTIVE_KEY, "user:ledger");

    const { discardLegacyOfflineCache } = await freshClientCache();
    await expect(discardLegacyOfflineCache()).resolves.toBeUndefined();
    expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();

    legacyDb.close();
    await deleteLegacyDb();
  });

  it("never throws when deletion errors", async () => {
    vi.stubGlobal("indexedDB", {
      deleteDatabase: vi.fn(() => {
        const request = {} as IDBOpenDBRequest;
        setTimeout(() => request.onerror?.(new Event("error")), 0);
        return request;
      }),
    });
    localStorage.setItem(LEGACY_ACTIVE_KEY, "user:ledger");

    const { discardLegacyOfflineCache } = await freshClientCache();
    await expect(discardLegacyOfflineCache()).resolves.toBeUndefined();
    expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();
  });

  it("resolves immediately when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    localStorage.setItem(LEGACY_ACTIVE_KEY, "user:ledger");

    const { discardLegacyOfflineCache } = await freshClientCache();
    await expect(discardLegacyOfflineCache()).resolves.toBeUndefined();
    expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBeNull();
  });
});

describe("client cache helpers", () => {
  it("returns null active cache key when none is stored", () => {
    expect(getActiveStartupCacheKey()).toBeNull();
  });

  it("clears nothing when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(clearUserCacheData("user")).resolves.toBeUndefined();
  });

  it("rejects cache opening when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(openCacheDb()).rejects.toThrow("IndexedDB is unavailable");
  });

  it("returns null active cache key when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getActiveStartupCacheKey()).toBeNull();
  });
});
