"use client";

export const CACHE_DB_NAME = "cashier-cache";
export const CACHE_DB_VERSION = 1;
export const LEDGER_SNAPSHOT_STORE = "ledgerSnapshots";
export const DOCUMENT_IMAGE_STORE = "documentImages";
export const ACTIVE_STARTUP_CACHE_KEY = "cashier.startupCache.activeSnapshot";

/** Legacy storage names are only referenced by the one-time compatibility migration. */
const LEGACY_DB_NAME = "cashier-offline";
const LEGACY_DB_VERSION = 5;
const LEGACY_SNAPSHOT_STORE = "snapshots";
const LEGACY_IMAGE_STORE = "images";
const LEGACY_ACTIVE_KEY = "cashier.offline.activeSnapshot";

export interface LegacyOfflineSnapshotRecord {
  key: string;
  schemaVersion?: number;
  userId: string;
  ledgerId: string;
  items?: unknown[];
  [field: string]: unknown;
}

export interface LegacyOfflineImageRecord {
  key: string;
  snapshotKey: string;
  fileId: string;
  documentId: string;
  contentType: string;
  byteSize: number;
  blob: Blob;
  viewed?: boolean;
  priorityAt?: number;
  lastAccessedAt?: number;
  [field: string]: unknown;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

export function openCacheDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEDGER_SNAPSHOT_STORE)) {
        const snapshots = db.createObjectStore(LEDGER_SNAPSHOT_STORE, { keyPath: "key" });
        snapshots.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains(DOCUMENT_IMAGE_STORE)) {
        const images = db.createObjectStore(DOCUMENT_IMAGE_STORE, { keyPath: "key" });
        images.createIndex("snapshotKey", "snapshotKey", { unique: false });
        images.createIndex("userId", "userId", { unique: false });
        images.createIndex("snapshotAccess", ["snapshotKey", "lastAccessedAt"], {
          unique: false,
        });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open client cache database"));
    };
  });
  return databasePromise;
}

export function getActiveStartupCacheKey(): string | null {
  return typeof localStorage === "undefined"
    ? null
    : localStorage.getItem(ACTIVE_STARTUP_CACHE_KEY);
}

export function setActiveStartupCacheKey(key: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_STARTUP_CACHE_KEY, key);
}

export function removeActiveStartupCacheKey(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(ACTIVE_STARTUP_CACHE_KEY);
}

/** Clears every user-level startup snapshot and document image from the cache. */
export async function clearUserCacheData(userId?: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openCacheDb();
  const tx = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readwrite");
  const snapshots = tx.objectStore(LEDGER_SNAPSHOT_STORE);
  const images = tx.objectStore(DOCUMENT_IMAGE_STORE);
  if (userId == null || userId === "") {
    snapshots.clear();
    images.clear();
  } else {
    const userSnapshots = await requestResult(
      snapshots.index("userId").getAll(userId) as IDBRequest<Array<{ key: string }>>
    );
    for (const snapshot of userSnapshots) snapshots.delete(snapshot.key);
    const userImages = await requestResult(
      images.index("userId").getAll(userId) as IDBRequest<Array<{ key: string }>>
    );
    for (const image of userImages) images.delete(image.key);
  }
  await transactionDone(tx);
  removeActiveStartupCacheKey();
}

function openLegacyDbIfExists(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      const hasStores =
        db.objectStoreNames.contains(LEGACY_SNAPSHOT_STORE) ||
        db.objectStoreNames.contains(LEGACY_IMAGE_STORE);
      if (!hasStores) {
        db.close();
        resolve(null);
        return;
      }
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onupgradeneeded = () => {
      // The legacy database may be at an older schema version. The upgrade
      // handler must not throw so opening still succeeds when possible.
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains(LEGACY_SNAPSHOT_STORE)) {
          db.createObjectStore(LEGACY_SNAPSHOT_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(LEGACY_IMAGE_STORE)) {
          db.createObjectStore(LEGACY_IMAGE_STORE, { keyPath: "key" });
        }
      } catch {
        // Ignore; reads below will fail and migration falls back to empty.
      }
    };
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Normalizes a legacy snapshot record for storage in the new cache DB. */
export function normalizeLegacySnapshotRecord(
  snapshot: LegacyOfflineSnapshotRecord
): LegacyOfflineSnapshotRecord {
  return {
    key: snapshot.key,
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : 5,
    userId: snapshot.userId,
    ledgerId: snapshot.ledgerId,
    ...(snapshot.locale !== undefined ? { locale: snapshot.locale } : {}),
    ...(snapshot.mainCurrency !== undefined ? { mainCurrency: snapshot.mainCurrency } : {}),
    ...(snapshot.preferredCurrencies !== undefined
      ? { preferredCurrencies: snapshot.preferredCurrencies }
      : {}),
    ...(snapshot.categories !== undefined ? { categories: snapshot.categories } : {}),
    ...(snapshot.ledgerSettings !== undefined ? { ledgerSettings: snapshot.ledgerSettings } : {}),
    items: Array.isArray(snapshot.items) ? snapshot.items : [],
    ...(snapshot.syncVersion !== undefined ? { syncVersion: snapshot.syncVersion } : {}),
    ...(snapshot.recordCount !== undefined ? { recordCount: snapshot.recordCount } : {}),
    ...(snapshot.complete !== undefined ? { complete: snapshot.complete } : {}),
    ...(snapshot.truncated !== undefined ? { truncated: snapshot.truncated } : {}),
    ...(snapshot.coverageLimit !== undefined ? { coverageLimit: snapshot.coverageLimit } : {}),
    lastSyncedAt:
      typeof snapshot.lastSyncedAt === "string" ? snapshot.lastSyncedAt : new Date().toISOString(),
    ...(snapshot.fullSyncAt !== undefined ? { fullSyncAt: snapshot.fullSyncAt } : {}),
  };
}

/** Normalizes a legacy image record for storage in the new cache DB. */
export function normalizeLegacyImageRecord(
  image: LegacyOfflineImageRecord
): LegacyOfflineImageRecord {
  return {
    key: image.key,
    snapshotKey: image.snapshotKey,
    userId: image.snapshotKey.split(":")[0] ?? "",
    fileId: image.fileId,
    documentId: image.documentId,
    contentType: image.contentType,
    byteSize: image.byteSize,
    blob: image.blob,
    lastAccessedAt: typeof image.lastAccessedAt === "number" ? image.lastAccessedAt : Date.now(),
  };
}

/**
 * One-time migration from the legacy cashier-offline database. Copies
 * snapshots and viewed image blobs into cashier-cache, then deletes the old
 * storage. Failures are swallowed so an empty cache is a safe fallback.
 */
export async function migrateLegacyOfflineCache(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const legacyDb = await openLegacyDbIfExists();
    const hasLegacyKey =
      typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_ACTIVE_KEY) != null;
    if (legacyDb == null) {
      if (hasLegacyKey) localStorage.removeItem(LEGACY_ACTIVE_KEY);
      return false;
    }

    const snapshotTx = legacyDb.transaction(LEGACY_SNAPSHOT_STORE, "readonly");
    const snapshots = await requestResult(
      snapshotTx.objectStore(LEGACY_SNAPSHOT_STORE).getAll() as IDBRequest<
        LegacyOfflineSnapshotRecord[]
      >
    );
    const imageTx = legacyDb.transaction(LEGACY_IMAGE_STORE, "readonly");
    const images = await requestResult(
      imageTx.objectStore(LEGACY_IMAGE_STORE).getAll() as IDBRequest<LegacyOfflineImageRecord[]>
    );

    const targetDb = await openCacheDb();
    const writeTx = targetDb.transaction(
      [LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE],
      "readwrite"
    );
    const snapshotStore = writeTx.objectStore(LEDGER_SNAPSHOT_STORE);
    for (const snapshot of snapshots) {
      snapshotStore.put(normalizeLegacySnapshotRecord(snapshot));
    }
    const imageStore = writeTx.objectStore(DOCUMENT_IMAGE_STORE);
    for (const image of images) {
      imageStore.put(normalizeLegacyImageRecord(image));
    }
    await transactionDone(writeTx);

    legacyDb.close();
    await deleteDatabase(LEGACY_DB_NAME);
    if (typeof localStorage !== "undefined") localStorage.removeItem(LEGACY_ACTIVE_KEY);
    return true;
  } catch {
    return false;
  }
}
