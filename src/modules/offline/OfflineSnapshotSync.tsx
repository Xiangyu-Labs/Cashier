"use client";

import { useEffect } from "react";
import { getSourceDocumentsAction } from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";
import {
  OFFLINE_DOCUMENT_LIMIT,
  OFFLINE_FULL_SYNC_INTERVAL_MS,
  cacheOfflineImage,
  clearOfflineData,
  getActiveOfflineSnapshotKey,
  hasOfflineImage,
  offlineSnapshotKey,
  readOfflineSnapshot,
  writeOfflineSnapshot,
} from "./offline-store";

interface OfflineSnapshotSyncProps {
  userId: string;
  ledgerId: string;
  locale: string;
  mainCurrency: string;
  collapseEntriesDefault: boolean;
  timeZone: string | null;
  preferredCurrencies: string[];
  categories: EntryCategory[];
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function canPrefetchImages() {
  if (document.visibilityState !== "visible") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return (
    connection?.saveData !== true && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
  );
}

function mergeFirstPage(
  firstPage: SourceDocumentListItemDto[],
  previous: SourceDocumentListItemDto[]
) {
  const firstPageIds = new Set(firstPage.map((item) => item.id));
  return [...firstPage, ...previous.filter((item) => !firstPageIds.has(item.id))].slice(
    0,
    OFFLINE_DOCUMENT_LIMIT
  );
}

async function prefetchLatestImages(
  snapshotKey: string,
  items: SourceDocumentListItemDto[],
  signal: AbortSignal
) {
  if (!canPrefetchImages()) return;
  for (const item of items) {
    for (const file of item.files) {
      if (signal.aborted || !canPrefetchImages()) return;
      if (await hasOfflineImage(snapshotKey, file.id)) continue;
      await cacheOfflineImage({
        snapshotKey,
        documentId: item.id,
        documentTimestamp: item.entryDate ?? item.createdAt,
        file,
        viewed: false,
      }).catch(() => false);
    }
  }
}

async function syncSnapshot(input: OfflineSnapshotSyncProps, signal: AbortSignal) {
  await navigator.storage?.persist?.().catch(() => false);
  const activeKey = getActiveOfflineSnapshotKey();
  if (activeKey != null && !activeKey.startsWith(`${input.userId}:`)) {
    await clearOfflineData();
  }
  const key = offlineSnapshotKey(input.userId, input.ledgerId);
  const previous = await readOfflineSnapshot(key);
  const needsFullSync =
    previous?.fullSyncAt == null ||
    Date.now() - Date.parse(previous.fullSyncAt) >= OFFLINE_FULL_SYNC_INTERVAL_MS;
  const pages: SourceDocumentListItemDto[] = [];
  let cursor: string | null = null;

  do {
    if (signal.aborted || document.visibilityState !== "visible") return;
    const page = await getSourceDocumentsAction(input.ledgerId, {
      limit: 100,
      includeEntries: true,
      includeFiles: true,
      ...(cursor != null ? { cursor } : {}),
    });
    pages.push(...page.items);
    cursor = page.nextCursor;
  } while (needsFullSync && cursor != null && pages.length < OFFLINE_DOCUMENT_LIMIT);

  const now = new Date().toISOString();
  const items = needsFullSync
    ? pages.slice(0, OFFLINE_DOCUMENT_LIMIT)
    : mergeFirstPage(pages, previous?.items ?? []);
  await writeOfflineSnapshot({
    key,
    schemaVersion: 2,
    userId: input.userId,
    ledgerId: input.ledgerId,
    locale: input.locale,
    mainCurrency: input.mainCurrency,
    preferredCurrencies: input.preferredCurrencies,
    categories: input.categories,
    ledgerSettings: {
      collapseEntriesDefault: input.collapseEntriesDefault,
      timeZone: input.timeZone,
    },
    items,
    viewedItems: previous?.viewedItems ?? [],
    lastSyncedAt: now,
    fullSyncAt: needsFullSync ? now : (previous?.fullSyncAt ?? null),
  });
  await prefetchLatestImages(key, items, signal);
}

export function OfflineSnapshotSync(props: OfflineSnapshotSyncProps) {
  const {
    userId,
    ledgerId,
    locale,
    mainCurrency,
    collapseEntriesDefault,
    timeZone,
    preferredCurrencies,
    categories,
  } = props;
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const controller = new AbortController();
    const run = () =>
      void syncSnapshot(
        {
          userId,
          ledgerId,
          locale,
          mainCurrency,
          collapseEntriesDefault,
          timeZone,
          preferredCurrencies,
          categories,
        },
        controller.signal
      ).catch(() => {});
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 5000 });
    } else {
      timerId = setTimeout(run, 1500);
    }
    return () => {
      controller.abort();
      if (idleId != null) window.cancelIdleCallback(idleId);
      if (timerId != null) clearTimeout(timerId);
    };
  }, [
    categories,
    collapseEntriesDefault,
    ledgerId,
    locale,
    mainCurrency,
    preferredCurrencies,
    timeZone,
    userId,
  ]);

  return null;
}
