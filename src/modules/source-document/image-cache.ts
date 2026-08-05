"use client";

import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import {
  DOCUMENT_IMAGE_STORE,
  openCacheDb,
  requestResult,
  transactionDone,
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

export function imageCacheKey(snapshotKey: string, fileId: string) {
  return `${snapshotKey}:${fileId}`;
}

export async function readCachedImages(snapshotKey: string): Promise<CachedImageRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openCacheDb();
  const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readonly");
  return await requestResult(
    tx.objectStore(DOCUMENT_IMAGE_STORE).index("snapshotKey").getAll(snapshotKey) as IDBRequest<
      CachedImageRecord[]
    >
  );
}

export async function readCachedImagesForFiles(
  snapshotKey: string,
  fileIds: readonly string[]
): Promise<CachedImageRecord[]> {
  if (typeof indexedDB === "undefined" || fileIds.length === 0) return [];
  const records = await readCachedImages(snapshotKey);
  const wanted = new Set(fileIds);
  return records.filter((record) => wanted.has(record.fileId));
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
 * returns the stored record. Existing records only refresh their access time.
 */
export async function cacheImage(input: {
  snapshotKey: string;
  documentId: string;
  documentTimestamp: string;
  file: SourceDocumentStoredFileDto;
}): Promise<CachedImageRecord | null> {
  if (input.file.byteSize > CACHED_IMAGE_BYTES_LIMIT) return null;
  const key = imageCacheKey(input.snapshotKey, input.file.id);
  const existingDb = await openCacheDb();
  const existingTx = existingDb.transaction(DOCUMENT_IMAGE_STORE, "readonly");
  const existing = await requestResult(
    existingTx.objectStore(DOCUMENT_IMAGE_STORE).get(key) as IDBRequest<
      CachedImageRecord | undefined
    >
  );
  if (existing != null) {
    const touchTx = existingDb.transaction(DOCUMENT_IMAGE_STORE, "readwrite");
    touchTx.objectStore(DOCUMENT_IMAGE_STORE).put({ ...existing, lastAccessedAt: Date.now() });
    await transactionDone(touchTx);
    return existing;
  }

  const response = await fetch(storedFileReadUrl(input.file.id), { credentials: "include" });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > CACHED_IMAGE_BYTES_LIMIT) return null;

  const db = await openCacheDb();
  const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readwrite");
  const store = tx.objectStore(DOCUMENT_IMAGE_STORE);
  const records = await requestResult(
    store.index("snapshotKey").getAll(input.snapshotKey) as IDBRequest<CachedImageRecord[]>
  );
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
  await transactionDone(tx);
  return record;
}
