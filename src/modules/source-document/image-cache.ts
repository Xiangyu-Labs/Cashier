"use client";

import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import {
  DOCUMENT_IMAGE_STORE,
  DOCUMENT_IMAGE_ACCESS_STORE,
  openCacheDb,
  requestResult,
  transactionDone,
  captureImageCacheGeneration,
} from "@/lib/client-cache";
import { storedFileReadUrl } from "./stored-file-read";

export const CACHED_IMAGE_COUNT_LIMIT = 100;
export const CACHED_IMAGE_BYTES_LIMIT = 10 * 1024 * 1024;

export interface CachedImageRecord {
  key: string;
  snapshotKey: string;
  userId: string;
  fileId: string;
  documentId: string;
  contentType: string;
  byteSize: number;
  blob: Blob;
  lastAccessedAt: number;
}

interface CachedImageAccessRecord {
  key: string;
  snapshotKey: string;
  userId: string;
  lastAccessedAt: number;
}

export function imageCacheKey(snapshotKey: string, fileId: string) {
  return `${snapshotKey}:${fileId}`;
}

/**
 * Module-level single-flight map shared by every detail component and by
 * Strict Mode remounts, keyed by snapshot + file id. Entries are removed once
 * the request settles so a failed request can be retried.
 */
const inFlightImageRequests = new Map<string, Promise<CachedImageRecord | null>>();

export async function readCachedImages(snapshotKey: string): Promise<CachedImageRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openCacheDb();
  const tx = db.transaction([DOCUMENT_IMAGE_STORE, DOCUMENT_IMAGE_ACCESS_STORE], "readonly");
  const [images, accessRows] = await Promise.all([
    requestResult(
      tx.objectStore(DOCUMENT_IMAGE_STORE).index("snapshotKey").getAll(snapshotKey) as IDBRequest<
        CachedImageRecord[]
      >
    ),
    requestResult(
      tx
        .objectStore(DOCUMENT_IMAGE_ACCESS_STORE)
        .index("snapshotKey")
        .getAll(snapshotKey) as IDBRequest<CachedImageAccessRecord[]>
    ),
  ]);
  const accessByKey = new Map(accessRows.map((row) => [row.key, row.lastAccessedAt]));
  return images.map((image) => ({
    ...image,
    lastAccessedAt: accessByKey.get(image.key) ?? image.lastAccessedAt,
  }));
}

async function readCachedImageKeys(
  snapshotKey: string,
  fileIds: readonly string[]
): Promise<CachedImageRecord[]> {
  const db = await openCacheDb();
  const tx = db.transaction([DOCUMENT_IMAGE_STORE, DOCUMENT_IMAGE_ACCESS_STORE], "readwrite");
  const images = tx.objectStore(DOCUMENT_IMAGE_STORE);
  const access = tx.objectStore(DOCUMENT_IMAGE_ACCESS_STORE);
  const records = await Promise.all(
    [...new Set(fileIds)].map(async (fileId) => {
      const key = imageCacheKey(snapshotKey, fileId);
      const [image, accessRow] = await Promise.all([
        requestResult(images.get(key) as IDBRequest<CachedImageRecord | undefined>),
        requestResult(access.get(key) as IDBRequest<CachedImageAccessRecord | undefined>),
      ]);
      if (image == null) return null;
      const lastAccessedAt = Date.now();
      access.put({
        key,
        snapshotKey: image.snapshotKey,
        userId: image.userId,
        lastAccessedAt,
      } satisfies CachedImageAccessRecord);
      return { ...image, lastAccessedAt: Math.max(accessRow?.lastAccessedAt ?? 0, lastAccessedAt) };
    })
  );
  await transactionDone(tx);
  return records.filter((record): record is CachedImageRecord => record != null);
}

export async function readCachedImagesForFiles(
  snapshotKey: string,
  fileIds: readonly string[]
): Promise<CachedImageRecord[]> {
  if (typeof indexedDB === "undefined" || fileIds.length === 0) return [];
  return readCachedImageKeys(snapshotKey, fileIds);
}

export function selectCachedImageEvictions(
  records: CachedImageRecord[],
  incomingBytes: number,
  replacingKey?: string
): CachedImageRecord[] {
  const retained = records.filter((record) => record.key !== replacingKey);
  let bytes = retained.reduce((total, record) => total + record.byteSize, 0);
  let count = retained.length;
  const candidates = retained.toSorted(
    (left, right) => left.lastAccessedAt - right.lastAccessedAt || left.key.localeCompare(right.key)
  );
  const evictions: CachedImageRecord[] = [];
  while (
    candidates.length > 0 &&
    (count + 1 > CACHED_IMAGE_COUNT_LIMIT || bytes + incomingBytes > CACHED_IMAGE_BYTES_LIMIT)
  ) {
    const candidate = candidates.shift();
    if (candidate == null) break;
    evictions.push(candidate);
    count -= 1;
    bytes -= candidate.byteSize;
  }
  return evictions;
}

/**
 * Fetches an authenticated image once, stores it in the client cache, and
 * returns the stored record. Existing records only refresh their access time
 * and the updated record is returned. Concurrent callers for the same
 * snapshot key + file id share a single request.
 */
export function cacheImage(input: {
  snapshotKey: string;
  documentId: string;
  documentTimestamp: string;
  file: SourceDocumentStoredFileDto;
}): Promise<CachedImageRecord | null> {
  if (input.file.byteSize > CACHED_IMAGE_BYTES_LIMIT) return Promise.resolve(null);
  const key = imageCacheKey(input.snapshotKey, input.file.id);
  const userId = input.snapshotKey.split(":")[0] ?? "";
  const generation = captureImageCacheGeneration(userId);
  const requestKey = `${key}@${generation.generation}`;
  const pending = inFlightImageRequests.get(requestKey);
  if (pending != null) return pending;
  const request = runCacheImage(input, key, generation).finally(() => {
    inFlightImageRequests.delete(requestKey);
  });
  inFlightImageRequests.set(requestKey, request);
  return request;
}

async function runCacheImage(
  input: {
    snapshotKey: string;
    documentId: string;
    documentTimestamp: string;
    file: SourceDocumentStoredFileDto;
  },
  key: string,
  generation: ReturnType<typeof captureImageCacheGeneration>
): Promise<CachedImageRecord | null> {
  const existingDb = await openCacheDb();
  const existingTx = existingDb.transaction(DOCUMENT_IMAGE_STORE, "readonly");
  const existing = await requestResult(
    existingTx.objectStore(DOCUMENT_IMAGE_STORE).get(key) as IDBRequest<
      CachedImageRecord | undefined
    >
  );
  if (existing != null) {
    if (!generation.isCurrent()) return null;
    const touched = { ...existing, lastAccessedAt: Date.now() };
    const touchTx = existingDb.transaction(DOCUMENT_IMAGE_ACCESS_STORE, "readwrite");
    touchTx.objectStore(DOCUMENT_IMAGE_ACCESS_STORE).put({
      key,
      snapshotKey: existing.snapshotKey,
      userId: existing.userId,
      lastAccessedAt: touched.lastAccessedAt,
    } satisfies CachedImageAccessRecord);
    await transactionDone(touchTx);
    return touched;
  }

  const response = await fetch(storedFileReadUrl(input.file.id), {
    credentials: "include",
    signal: generation.signal,
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > CACHED_IMAGE_BYTES_LIMIT) return null;

  const db = await openCacheDb();
  const tx = db.transaction([DOCUMENT_IMAGE_STORE, DOCUMENT_IMAGE_ACCESS_STORE], "readwrite");
  const store = tx.objectStore(DOCUMENT_IMAGE_STORE);
  const accessStore = tx.objectStore(DOCUMENT_IMAGE_ACCESS_STORE);
  const [rawRecords, accessRows] = await Promise.all([
    requestResult(
      store.index("snapshotKey").getAll(input.snapshotKey) as IDBRequest<CachedImageRecord[]>
    ),
    requestResult(
      accessStore.index("snapshotKey").getAll(input.snapshotKey) as IDBRequest<
        CachedImageAccessRecord[]
      >
    ),
  ]);
  if (!generation.isCurrent()) {
    tx.abort();
    return null;
  }
  const accessByKey = new Map(accessRows.map((row) => [row.key, row.lastAccessedAt]));
  const records = rawRecords.map((record) => ({
    ...record,
    lastAccessedAt: accessByKey.get(record.key) ?? record.lastAccessedAt,
  }));
  const evictions = selectCachedImageEvictions(records, blob.size, key);
  const evictionKeys = new Set(evictions.map((item) => item.key));
  const remaining = records.filter((record) => record.key !== key && !evictionKeys.has(record.key));
  const remainingBytes = remaining.reduce((total, record) => total + record.byteSize, 0);
  if (
    remaining.length + 1 > CACHED_IMAGE_COUNT_LIMIT ||
    remainingBytes + blob.size > CACHED_IMAGE_BYTES_LIMIT
  ) {
    tx.abort();
    return null;
  }
  for (const record of evictions) store.delete(record.key);
  for (const record of evictions) accessStore.delete(record.key);
  const record: CachedImageRecord = {
    key,
    snapshotKey: input.snapshotKey,
    userId: input.snapshotKey.split(":")[0] ?? "",
    fileId: input.file.id,
    documentId: input.documentId,
    contentType: blob.type || input.file.contentType,
    byteSize: blob.size,
    blob,
    lastAccessedAt: Date.now(),
  };
  store.put(record);
  accessStore.put({
    key,
    snapshotKey: input.snapshotKey,
    userId: record.userId,
    lastAccessedAt: record.lastAccessedAt,
  } satisfies CachedImageAccessRecord);
  await transactionDone(tx);
  return record;
}
