"use client";

import { useEffect } from "react";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { EntryCategory } from "@/modules/ledger/contracts";
import {
  cacheOfflineImage,
  clearOfflineData,
  getActiveOfflineSnapshotKey,
  hasOfflineImage,
  offlineSnapshotKey,
  readOfflineSnapshot,
  replaceOfflineSnapshot,
} from "./offline-store";
import { getOfflineLedgerSnapshot, getOfflineSnapshotVersion } from "./server-actions";

export type OfflineSyncStatus = "idle" | "checking" | "downloading" | "updated" | "error";

interface OfflineSnapshotSyncProps {
  userId: string;
  ledgerId: string;
  locale: string;
  mainCurrency: string;
  timeZone: string | null;
  collapseEntriesDefault: boolean;
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
  const version = await getOfflineSnapshotVersion(input.ledgerId);
  if (signal.aborted) return false;
  if (version.version === previous?.syncVersion) {
    if (
      previous != null &&
      (previous.locale !== input.locale ||
        previous.mainCurrency !== input.mainCurrency ||
        previous.ledgerSettings?.timeZone !== input.timeZone ||
        previous.ledgerSettings?.collapseEntriesDefault !== input.collapseEntriesDefault ||
        JSON.stringify(previous.preferredCurrencies ?? []) !==
          JSON.stringify(input.preferredCurrencies) ||
        JSON.stringify(previous.categories ?? []) !== JSON.stringify(input.categories))
    ) {
      await replaceOfflineSnapshot({
        ...previous,
        locale: input.locale,
        mainCurrency: input.mainCurrency,
        preferredCurrencies: input.preferredCurrencies,
        categories: input.categories,
        ledgerSettings: {
          timeZone: input.timeZone,
          collapseEntriesDefault: input.collapseEntriesDefault,
        },
      });
    }
    return false;
  }
  const payload = await getOfflineLedgerSnapshot(input.ledgerId, version.version);
  if (signal.aborted) return false;
  await replaceOfflineSnapshot({
    key,
    schemaVersion: 3,
    userId: input.userId,
    ledgerId: input.ledgerId,
    locale: input.locale,
    mainCurrency: input.mainCurrency,
    preferredCurrencies: input.preferredCurrencies,
    categories: input.categories,
    ledgerSettings: {
      timeZone: input.timeZone,
      collapseEntriesDefault: input.collapseEntriesDefault,
    },
    items: payload.items,
    viewedItems: previous?.viewedItems ?? [],
    syncVersion: payload.version,
    recordCount: payload.recordCount,
    complete: payload.complete,
    truncated: payload.truncated,
    coverageLimit: payload.coverageLimit,
    lastSyncedAt: payload.generatedAt,
    fullSyncAt: payload.generatedAt,
  });
  await prefetchLatestImages(key, payload.items, signal);
  return true;
}

export function OfflineSnapshotSync({
  onStatusChange,
  ...props
}: OfflineSnapshotSyncProps & {
  onStatusChange?: (status: OfflineSyncStatus) => void;
}) {
  const {
    userId,
    ledgerId,
    locale,
    mainCurrency,
    timeZone,
    collapseEntriesDefault,
    preferredCurrencies,
    categories,
  } = props;
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const controller = new AbortController();
    let running = false;
    let rerunRequested = false;
    const run = () => {
      if (running) {
        rerunRequested = true;
        return;
      }
      running = true;
      const statusTimer = setTimeout(() => onStatusChange?.("checking"), 150);
      void syncSnapshot(
        {
          userId,
          ledgerId,
          locale,
          mainCurrency,
          timeZone,
          collapseEntriesDefault,
          preferredCurrencies,
          categories,
        },
        controller.signal
      )
        .then((updated) => {
          clearTimeout(statusTimer);
          onStatusChange?.(updated ? "updated" : "idle");
        })
        .catch(() => {
          clearTimeout(statusTimer);
          onStatusChange?.("error");
        })
        .finally(() => {
          running = false;
          if (rerunRequested && !controller.signal.aborted) {
            rerunRequested = false;
            run();
          }
        });
    };
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 5000 });
    } else {
      timerId = setTimeout(run, 1500);
    }
    const onMutation = (event: Event) => {
      if ((event as CustomEvent<string>).detail === ledgerId) run();
    };
    window.addEventListener("cashier:ledger-mutated", onMutation);
    return () => {
      controller.abort();
      window.removeEventListener("cashier:ledger-mutated", onMutation);
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
    onStatusChange,
  ]);

  return null;
}
