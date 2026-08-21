import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_DB_NAME,
  CACHE_DB_VERSION,
  DOCUMENT_IMAGE_ACCESS_STORE,
  DOCUMENT_IMAGE_STORE,
  clearUserImageCacheData,
  openCacheDb,
  requestResult,
  transactionDone,
} from "@/lib/client-cache";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client cache database", () => {
  it("removes legacy snapshots and preserves images while adding access metadata", async () => {
    const seeded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("ledgerSnapshots", { keyPath: "key" });
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
    const seedTx = seeded.transaction(["ledgerSnapshots", DOCUMENT_IMAGE_STORE], "readwrite");
    seedTx.objectStore("ledgerSnapshots").put({ key: "user:ledger" });
    seedTx.objectStore(DOCUMENT_IMAGE_STORE).put(imageRecord("user", "file-1"));
    await transactionDone(seedTx);
    seeded.close();

    const db = await openCacheDb();
    expect(db.version).toBe(CACHE_DB_VERSION);
    expect(CACHE_DB_VERSION).toBe(4);
    expect(db.objectStoreNames.contains("ledgerSnapshots")).toBe(false);
    expect(db.objectStoreNames.contains(DOCUMENT_IMAGE_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(DOCUMENT_IMAGE_ACCESS_STORE)).toBe(true);
    const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readonly");
    const images = await requestResult(
      tx.objectStore(DOCUMENT_IMAGE_STORE).getAll() as IDBRequest<Array<{ fileId: string }>>
    );
    expect(images.map((image) => image.fileId)).toEqual(["file-1"]);
  });

  it("clears only the requested user's images", async () => {
    const db = await openCacheDb();
    const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readwrite");
    tx.objectStore(DOCUMENT_IMAGE_STORE).put(imageRecord("user", "file-1"));
    tx.objectStore(DOCUMENT_IMAGE_STORE).put(imageRecord("other", "file-2"));
    await transactionDone(tx);

    await clearUserImageCacheData("user");

    const verifyTx = db.transaction(DOCUMENT_IMAGE_STORE, "readonly");
    const images = await requestResult(
      verifyTx.objectStore(DOCUMENT_IMAGE_STORE).getAll() as IDBRequest<Array<{ userId: string }>>
    );
    expect(images.map((image) => image.userId)).toEqual(["other"]);
  });

  it("does nothing when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(clearUserImageCacheData("user")).resolves.toBeUndefined();
  });
});

function imageRecord(userId: string, fileId: string) {
  return {
    key: `${userId}:ledger:${fileId}`,
    snapshotKey: `${userId}:ledger`,
    userId,
    fileId,
    documentId: "doc-1",
    contentType: "image/png",
    byteSize: 1,
    blob: new Blob(["x"]),
    lastAccessedAt: 1,
  };
}
