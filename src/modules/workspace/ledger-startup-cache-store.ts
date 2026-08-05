"use client";

import type { EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { LedgerDeltaResult } from "@/modules/source-document/contract-refresh";
import {
  DOCUMENT_IMAGE_STORE,
  LEDGER_SNAPSHOT_STORE,
  getActiveStartupCacheKey,
  openCacheDb,
  removeActiveStartupCacheKey,
  requestResult,
  setActiveStartupCacheKey,
  transactionDone,
} from "@/lib/client-cache";

export {
  CACHED_DETAILS_PREVIEW_LIMIT,
  CACHED_STREAM_PREVIEW_LIMIT,
  LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT,
  LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS,
  ledgerStartupCacheKey,
} from "./ledger-startup-cache-constants";

export interface LedgerStartupCacheSnapshot {
  key: string;
  schemaVersion: 1;
  userId: string;
  ledgerId: string;
  locale?: string;
  mainCurrency?: string;
  preferredCurrencies?: string[];
  categories?: EntryCategory[];
  ledgerSettings?: {
    timeZone: string | null;
    collapseEntriesDefault?: boolean;
  };
  items: SourceDocumentListItemDto[];
  syncVersion: string;
  recordCount: number;
  complete: boolean;
  truncated: boolean;
  coverageLimit: number;
  lastSyncedAt: string;
  fullSyncAt: string | null;
}

export function mergeLedgerStartupDeltaItems(
  items: readonly SourceDocumentListItemDto[],
  delta: Pick<LedgerDeltaResult, "documents" | "tombstones">,
  coverageLimit: number
): SourceDocumentListItemDto[] {
  const tombstones = new Set(delta.tombstones);
  const changed = new Map(delta.documents.map((document) => [document.id, document]));
  return items
    .filter((item) => !tombstones.has(item.id) && !changed.has(item.id))
    .concat(delta.documents)
    .toSorted((left, right) => {
      const leftDate = left.entryDate ?? left.createdAt.slice(0, 10);
      const rightDate = right.entryDate ?? right.createdAt.slice(0, 10);
      return (
        rightDate.localeCompare(leftDate) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id)
      );
    })
    .slice(0, coverageLimit);
}

export async function readLedgerStartupSnapshot(
  key: string
): Promise<LedgerStartupCacheSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openCacheDb();
  const tx = db.transaction(LEDGER_SNAPSHOT_STORE, "readonly");
  const stored = await requestResult(
    tx.objectStore(LEDGER_SNAPSHOT_STORE).get(key) as IDBRequest<
      LedgerStartupCacheSnapshot | undefined
    >
  );
  if (stored == null) return null;
  // Any other schema (including missing) is treated as a cache miss: the
  // snapshot and its images are removed so they are never served or migrated.
  if (stored.schemaVersion !== 1) {
    const cleanup = db.transaction([LEDGER_SNAPSHOT_STORE, DOCUMENT_IMAGE_STORE], "readwrite");
    cleanup.objectStore(LEDGER_SNAPSHOT_STORE).delete(key);
    const imageStore = cleanup.objectStore(DOCUMENT_IMAGE_STORE);
    const images = await requestResult(
      imageStore.index("snapshotKey").getAll(key) as IDBRequest<Array<{ key: string }>>
    );
    for (const image of images) imageStore.delete(image.key);
    await transactionDone(cleanup);
    if (getActiveStartupCacheKey() === key) removeActiveStartupCacheKey();
    return null;
  }
  return stored;
}

export async function writeLedgerStartupSnapshot(
  snapshot: LedgerStartupCacheSnapshot
): Promise<void> {
  const db = await openCacheDb();
  const tx = db.transaction(LEDGER_SNAPSHOT_STORE, "readwrite");
  tx.objectStore(LEDGER_SNAPSHOT_STORE).put(snapshot);
  await transactionDone(tx);
  setActiveStartupCacheKey(snapshot.key);
}

/** Replaces the visible snapshot only after the complete payload is received. */
export async function replaceLedgerStartupSnapshot(
  snapshot: LedgerStartupCacheSnapshot
): Promise<void> {
  await writeLedgerStartupSnapshot(snapshot);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cashier:ledger-startup-cache", { detail: snapshot.key }));
  }
}
