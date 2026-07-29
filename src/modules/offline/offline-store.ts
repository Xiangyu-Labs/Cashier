"use client";

import type {
  SourceDocumentDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
  SourceDocumentStoredFileDto,
} from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "@/modules/source-document/stored-file-read";

const DB_NAME = "cashier-offline";
const DB_VERSION = 2;
const SNAPSHOT_STORE = "snapshots";
const IMAGE_STORE = "images";
const ACTIVE_SNAPSHOT_KEY = "cashier.offline.activeSnapshot";

export const OFFLINE_DOCUMENT_LIMIT = 1000;
export const OFFLINE_IMAGE_COUNT_LIMIT = 100;
export const OFFLINE_IMAGE_BYTES_LIMIT = 10 * 1024 * 1024;
export const OFFLINE_FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface OfflineLedgerSnapshot {
  key: string;
  schemaVersion: 2;
  userId: string;
  ledgerId: string;
  locale: string;
  mainCurrency: string;
  ledgerSettings: {
    collapseEntriesDefault: boolean;
    timeZone: string | null;
  };
  items: SourceDocumentListItemDto[];
  viewedItems: SourceDocumentListItemDto[];
  lastSyncedAt: string;
  fullSyncAt: string | null;
}

export interface OfflineImageRecord {
  key: string;
  snapshotKey: string;
  fileId: string;
  documentId: string;
  contentType: string;
  byteSize: number;
  blob: Blob;
  viewed: boolean;
  priorityAt: number;
  lastAccessedAt: number;
}

export function offlineSnapshotKey(userId: string, ledgerId: string) {
  return `${userId}:${ledgerId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const images = db.createObjectStore(IMAGE_STORE, { keyPath: "key" });
        images.createIndex("snapshotKey", "snapshotKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database"));
  });
}

export async function readOfflineSnapshot(key: string): Promise<OfflineLedgerSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    return (
      (await requestResult(
        tx.objectStore(SNAPSHOT_STORE).get(key) as IDBRequest<OfflineLedgerSnapshot | undefined>
      )) ?? null
    );
  } finally {
    db.close();
  }
}

export async function readOfflineImages(snapshotKey: string): Promise<OfflineImageRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(IMAGE_STORE, "readonly");
    return await requestResult(
      tx.objectStore(IMAGE_STORE).index("snapshotKey").getAll(snapshotKey) as IDBRequest<
        OfflineImageRecord[]
      >
    );
  } finally {
    db.close();
  }
}

export async function writeOfflineSnapshot(snapshot: OfflineLedgerSnapshot): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).put(snapshot);
    await transactionDone(tx);
    localStorage.setItem(ACTIVE_SNAPSHOT_KEY, snapshot.key);
  } finally {
    db.close();
  }
}

export async function clearOfflineData(userId?: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openOfflineDb();
  try {
    const tx = db.transaction([SNAPSHOT_STORE, IMAGE_STORE], "readwrite");
    const snapshots = tx.objectStore(SNAPSHOT_STORE);
    const images = tx.objectStore(IMAGE_STORE);
    if (userId == null) {
      snapshots.clear();
      images.clear();
    } else {
      const allSnapshots = await requestResult(
        snapshots.getAll() as IDBRequest<OfflineLedgerSnapshot[]>
      );
      const keys = new Set(
        allSnapshots.filter((item) => item.userId === userId).map((item) => item.key)
      );
      for (const key of keys) snapshots.delete(key);
      const allImages = await requestResult(images.getAll() as IDBRequest<OfflineImageRecord[]>);
      for (const image of allImages) {
        if (keys.has(image.snapshotKey)) images.delete(image.key);
      }
    }
    await transactionDone(tx);
    localStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
  } finally {
    db.close();
  }
}

function imageKey(snapshotKey: string, fileId: string) {
  return `${snapshotKey}:${fileId}`;
}

export async function hasOfflineImage(snapshotKey: string, fileId: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(IMAGE_STORE, "readonly");
    const value = await requestResult(
      tx.objectStore(IMAGE_STORE).getKey(imageKey(snapshotKey, fileId))
    );
    return value !== undefined;
  } finally {
    db.close();
  }
}

export function selectOfflineImageEvictions(
  records: OfflineImageRecord[],
  incomingBytes: number,
  replacingKey?: string,
  incoming: { viewed: boolean; priorityAt: number } = { viewed: true, priorityAt: Date.now() }
): OfflineImageRecord[] {
  const retained = records.filter((record) => record.key !== replacingKey);
  let bytes = retained.reduce((total, record) => total + record.byteSize, 0);
  let count = retained.length;
  const candidates = retained
    .filter(
      (record) => incoming.viewed || (!record.viewed && record.priorityAt < incoming.priorityAt)
    )
    .toSorted((a, b) => {
      if (a.viewed !== b.viewed) return a.viewed ? 1 : -1;
      return (
        (a.viewed ? a.lastAccessedAt : a.priorityAt) - (b.viewed ? b.lastAccessedAt : b.priorityAt)
      );
    });
  const evictions: OfflineImageRecord[] = [];
  while (
    candidates.length > 0 &&
    (count + 1 > OFFLINE_IMAGE_COUNT_LIMIT || bytes + incomingBytes > OFFLINE_IMAGE_BYTES_LIMIT)
  ) {
    const candidate = candidates.shift();
    if (candidate == null) break;
    evictions.push(candidate);
    count -= 1;
    bytes -= candidate.byteSize;
  }
  return evictions;
}

export async function cacheOfflineImage(input: {
  snapshotKey: string;
  documentId: string;
  documentTimestamp: string;
  file: SourceDocumentStoredFileDto;
  viewed: boolean;
}): Promise<boolean> {
  if (input.file.byteSize > OFFLINE_IMAGE_BYTES_LIMIT) return false;
  const key = imageKey(input.snapshotKey, input.file.id);
  const existingDb = await openOfflineDb();
  try {
    const existingTx = existingDb.transaction(IMAGE_STORE, input.viewed ? "readwrite" : "readonly");
    const store = existingTx.objectStore(IMAGE_STORE);
    const existing = await requestResult(
      store.get(key) as IDBRequest<OfflineImageRecord | undefined>
    );
    if (existing != null) {
      if (input.viewed) {
        store.put({ ...existing, viewed: true, lastAccessedAt: Date.now() });
        await transactionDone(existingTx);
      }
      return true;
    }
  } finally {
    existingDb.close();
  }
  const response = await fetch(storedFileReadUrl(input.file.id), { credentials: "include" });
  if (!response.ok) return false;
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > OFFLINE_IMAGE_BYTES_LIMIT) return false;

  const db = await openOfflineDb();
  try {
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    const store = tx.objectStore(IMAGE_STORE);
    const index = store.index("snapshotKey");
    const records = await requestResult(
      index.getAll(input.snapshotKey) as IDBRequest<OfflineImageRecord[]>
    );
    const previous = records.find((record) => record.key === key);
    const priorityAt = Date.parse(input.documentTimestamp) || Date.now();
    const evictions = selectOfflineImageEvictions(records, blob.size, key, {
      viewed: input.viewed,
      priorityAt,
    });
    const remainingBytes = records
      .filter((record) => record.key !== key && !evictions.some((item) => item.key === record.key))
      .reduce((total, record) => total + record.byteSize, 0);
    const remainingCount = records.filter(
      (record) => record.key !== key && !evictions.some((item) => item.key === record.key)
    ).length;
    if (
      remainingCount + 1 > OFFLINE_IMAGE_COUNT_LIMIT ||
      remainingBytes + blob.size > OFFLINE_IMAGE_BYTES_LIMIT
    ) {
      tx.abort();
      return false;
    }
    for (const record of evictions) store.delete(record.key);
    const now = Date.now();
    store.put({
      key,
      snapshotKey: input.snapshotKey,
      fileId: input.file.id,
      documentId: input.documentId,
      contentType: blob.type || input.file.contentType,
      byteSize: blob.size,
      blob,
      viewed: input.viewed || previous?.viewed === true,
      priorityAt,
      lastAccessedAt: input.viewed ? now : (previous?.lastAccessedAt ?? now),
    } satisfies OfflineImageRecord);
    await transactionDone(tx);
    return true;
  } finally {
    db.close();
  }
}

export async function rememberViewedDocument(input: {
  snapshotKey: string;
  document: SourceDocumentDto | SourceDocumentLightDto;
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}): Promise<void> {
  const snapshot = await readOfflineSnapshot(input.snapshotKey);
  if (snapshot == null) return;
  const item: SourceDocumentListItemDto = {
    id: input.document.id,
    ledgerId: input.document.ledgerId,
    title: input.document.title,
    text: null,
    files: input.document.files,
    status: input.document.status,
    type: input.document.type,
    anomalyReason: input.document.anomalyReason,
    entryDate: input.document.entryDate,
    metadata: {},
    createdAt: input.document.createdAt,
    updatedAt: "updatedAt" in input.document ? input.document.updatedAt : input.document.createdAt,
    deletedAt: null,
    ledgerEntries: input.ledgerEntries,
    hasImages: input.document.hasImages ?? input.document.files.length > 0,
    supportedActions: input.document.supportedActions,
    errorCode: input.document.errorCode,
    pendingRevisionId: input.document.pendingRevisionId,
    ...(input.document.activeResultSummary !== undefined
      ? { activeResultSummary: input.document.activeResultSummary }
      : {}),
  };
  snapshot.viewedItems = [
    item,
    ...snapshot.viewedItems.filter((entry) => entry.id !== item.id),
  ].slice(0, OFFLINE_IMAGE_COUNT_LIMIT);
  await writeOfflineSnapshot(snapshot);
}

export function getActiveOfflineSnapshotKey(): string | null {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
}
