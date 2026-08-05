"use client";

import type { EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { LedgerDeltaResult } from "@/modules/source-document/contract-refresh";
import {
  LEDGER_SNAPSHOT_STORE,
  openCacheDb,
  requestResult,
  setActiveStartupCacheKey,
  transactionDone,
} from "@/lib/client-cache";
import { LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT } from "./ledger-startup-cache-constants";

export {
  CACHED_DETAILS_PREVIEW_LIMIT,
  CACHED_STREAM_PREVIEW_LIMIT,
  LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT,
  LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS,
  ledgerStartupCacheKey,
} from "./ledger-startup-cache-constants";

export interface LedgerStartupCacheSnapshot {
  key: string;
  schemaVersion: 5;
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

type LegacyLedgerStartupCacheSnapshot = Omit<
  LedgerStartupCacheSnapshot,
  "schemaVersion" | "syncVersion" | "recordCount" | "complete" | "truncated" | "coverageLimit"
> & {
  schemaVersion?: 1 | 2 | 3 | 4 | 5;
  syncVersion?: string;
  recordCount?: number;
  complete?: boolean;
  truncated?: boolean;
  coverageLimit?: number;
  viewedItems?: SourceDocumentListItemDto[];
};

export function migrateLedgerStartupSnapshot(
  snapshot: LedgerStartupCacheSnapshot | LegacyLedgerStartupCacheSnapshot
): LedgerStartupCacheSnapshot {
  if (snapshot.schemaVersion === 5) {
    const { viewedItems: _viewedItems, ...rest } = snapshot as LegacyLedgerStartupCacheSnapshot;
    return rest as LedgerStartupCacheSnapshot;
  }
  if (snapshot.schemaVersion === 4) {
    return { ...snapshot, schemaVersion: 5 } as LedgerStartupCacheSnapshot;
  }
  return {
    key: snapshot.key,
    schemaVersion: 5,
    userId: snapshot.userId,
    ledgerId: snapshot.ledgerId,
    items: [],
    syncVersion: "0",
    recordCount: 0,
    complete: false,
    truncated: false,
    coverageLimit: LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT,
    lastSyncedAt: snapshot.lastSyncedAt,
    fullSyncAt: null,
  };
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
      LedgerStartupCacheSnapshot | LegacyLedgerStartupCacheSnapshot | undefined
    >
  );
  if (stored == null) return null;
  const migrated = migrateLedgerStartupSnapshot(stored);
  if (stored.schemaVersion !== 5 || "viewedItems" in stored) {
    const migration = db.transaction(LEDGER_SNAPSHOT_STORE, "readwrite");
    migration.objectStore(LEDGER_SNAPSHOT_STORE).put(migrated);
    await transactionDone(migration);
  }
  return migrated;
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
