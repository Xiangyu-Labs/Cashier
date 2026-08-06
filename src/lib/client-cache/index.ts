"use client";

export const CACHE_DB_NAME = "cashier-cache";
export const CACHE_DB_VERSION = 2;
export const LEDGER_SNAPSHOT_STORE = "ledgerSnapshots";
export const DOCUMENT_IMAGE_STORE = "documentImages";
export const ACTIVE_STARTUP_CACHE_KEY = "cashier.startupCache.activeSnapshot";

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
      // Every upgrade invalidates the whole cache: old snapshot and image
      // records are never migrated or reused. They are rebuilt from the
      // server after the next full snapshot download.
      if (db.objectStoreNames.contains(LEDGER_SNAPSHOT_STORE)) {
        db.deleteObjectStore(LEDGER_SNAPSHOT_STORE);
      }
      const snapshots = db.createObjectStore(LEDGER_SNAPSHOT_STORE, { keyPath: "key" });
      snapshots.createIndex("userId", "userId", { unique: false });
      if (db.objectStoreNames.contains(DOCUMENT_IMAGE_STORE)) {
        db.deleteObjectStore(DOCUMENT_IMAGE_STORE);
      }
      const images = db.createObjectStore(DOCUMENT_IMAGE_STORE, { keyPath: "key" });
      images.createIndex("snapshotKey", "snapshotKey", { unique: false });
      images.createIndex("userId", "userId", { unique: false });
      images.createIndex("snapshotAccess", ["snapshotKey", "lastAccessedAt"], {
        unique: false,
      });
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

function hashIdentifier(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function reportClientCacheError(
  error: unknown,
  identifiers: { userId?: string; ledgerId?: string },
  message: string
): void {
  const errorObject = error instanceof Error ? error : null;
  const errorCode =
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
      ? String(error.code)
      : undefined;
  console.error(message, {
    error: {
      ...(errorObject?.name == null ? {} : { name: errorObject.name }),
      ...(errorCode == null ? {} : { code: errorCode }),
    },
    ...(identifiers.userId == null
      ? {}
      : { userSubject: `user:${hashIdentifier(identifiers.userId)}` }),
    ...(identifiers.ledgerId == null
      ? {}
      : { ledgerSubject: `ledger:${hashIdentifier(identifiers.ledgerId)}` }),
  });
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

export async function clearUserCacheDataSafely(
  userId: string | undefined,
  identifiers: { userId?: string; ledgerId?: string },
  message: string
): Promise<boolean> {
  try {
    await clearUserCacheData(userId);
    return true;
  } catch (error) {
    reportClientCacheError(error, identifiers, message);
    return false;
  }
}
