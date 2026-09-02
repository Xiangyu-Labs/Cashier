"use client";

export const CACHE_DB_NAME = "cashier-cache";
export const CACHE_DB_VERSION = 4;
const LEGACY_LEDGER_SNAPSHOT_STORE = "ledgerSnapshots";
export const DOCUMENT_IMAGE_STORE = "documentImages";
export const DOCUMENT_IMAGE_ACCESS_STORE = "documentImageAccess";

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

interface ImageCacheGeneration {
  generation: number;
  controller: AbortController;
}

const imageCacheGenerations = new Map<string, ImageCacheGeneration>();

function imageCacheGeneration(userId: string): ImageCacheGeneration {
  let state = imageCacheGenerations.get(userId);
  if (state == null) {
    state = { generation: 0, controller: new AbortController() };
    imageCacheGenerations.set(userId, state);
  }
  return state;
}

export function captureImageCacheGeneration(userId: string): {
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
} {
  const state = imageCacheGeneration(userId);
  const generation = state.generation;
  return {
    generation,
    signal: state.controller.signal,
    isCurrent: () =>
      imageCacheGenerations.get(userId)?.generation === generation &&
      !state.controller.signal.aborted,
  };
}

function invalidateImageCacheGeneration(userId?: string): void {
  const userIds = userId == null || userId === "" ? [...imageCacheGenerations.keys()] : [userId];
  for (const id of userIds) {
    const current = imageCacheGeneration(id);
    current.controller.abort();
    imageCacheGenerations.set(id, {
      generation: current.generation + 1,
      controller: new AbortController(),
    });
  }
}

export function openCacheDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(LEGACY_LEDGER_SNAPSHOT_STORE)) {
        db.deleteObjectStore(LEGACY_LEDGER_SNAPSHOT_STORE);
      }
      if (!db.objectStoreNames.contains(DOCUMENT_IMAGE_STORE)) {
        const images = db.createObjectStore(DOCUMENT_IMAGE_STORE, { keyPath: "key" });
        images.createIndex("snapshotKey", "snapshotKey", { unique: false });
        images.createIndex("userId", "userId", { unique: false });
        images.createIndex("snapshotAccess", ["snapshotKey", "lastAccessedAt"], {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains(DOCUMENT_IMAGE_ACCESS_STORE)) {
        const access = db.createObjectStore(DOCUMENT_IMAGE_ACCESS_STORE, { keyPath: "key" });
        access.createIndex("snapshotKey", "snapshotKey", { unique: false });
        access.createIndex("userId", "userId", { unique: false });
        access.createIndex("snapshotAccess", ["snapshotKey", "lastAccessedAt"], {
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

function hashIdentifier(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function reportClientCacheError(
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

/** Clears cached document images for one user, or all users when omitted. */
export async function clearUserImageCacheData(userId?: string): Promise<void> {
  invalidateImageCacheGeneration(userId);
  if (typeof indexedDB === "undefined") return;
  const db = await openCacheDb();
  const tx = db.transaction([DOCUMENT_IMAGE_STORE, DOCUMENT_IMAGE_ACCESS_STORE], "readwrite");
  const images = tx.objectStore(DOCUMENT_IMAGE_STORE);
  const access = tx.objectStore(DOCUMENT_IMAGE_ACCESS_STORE);
  if (userId == null || userId === "") {
    images.clear();
    access.clear();
  } else {
    const userImages = await requestResult(
      images.index("userId").getAll(userId) as IDBRequest<Array<{ key: string }>>
    );
    for (const image of userImages) images.delete(image.key);
    const accessRows = await requestResult(
      access.index("userId").getAll(userId) as IDBRequest<Array<{ key: string }>>
    );
    for (const row of accessRows) access.delete(row.key);
  }
  await transactionDone(tx);
}

export async function clearUserImageCacheDataSafely(
  userId: string | undefined,
  identifiers: { userId?: string; ledgerId?: string },
  message: string
): Promise<boolean> {
  try {
    await clearUserImageCacheData(userId);
    return true;
  } catch (error) {
    reportClientCacheError(error, identifiers, message);
    return false;
  }
}
