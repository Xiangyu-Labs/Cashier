"use client";

import { useEffect } from "react";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import type { LedgerDeltaResult } from "@/modules/source-document/contract-refresh";
import { clearUserCacheData, getActiveStartupCacheKey } from "@/lib/client-cache";
import {
  LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS,
  ledgerStartupCacheKey,
} from "./ledger-startup-cache-constants";
import {
  mergeLedgerStartupDeltaItems,
  readLedgerStartupSnapshot,
  replaceLedgerStartupSnapshot,
} from "./ledger-startup-cache-store";
import {
  getLedgerStartupCacheSnapshot,
  getLedgerStartupCacheVersion,
} from "./server-actions/ledger-startup-cache";

export interface LedgerStartupCacheSyncProps {
  userId: string;
  ledgerId: string;
  locale: string;
  mainCurrency: string;
  timeZone: string | null;
  collapseEntriesDefault: boolean;
  preferredCurrencies: string[];
  categories: EntryCategory[];
}

export async function syncStartupCache(input: LedgerStartupCacheSyncProps, signal: AbortSignal) {
  const activeKey = getActiveStartupCacheKey();
  if (activeKey != null && !activeKey.startsWith(`${input.userId}:`)) {
    await clearUserCacheData().catch(() => {});
  }
  const key = ledgerStartupCacheKey(input.userId, input.ledgerId);
  const previous = await readLedgerStartupSnapshot(key);
  const version = await getLedgerStartupCacheVersion(input.ledgerId);
  if (signal.aborted) return;
  const fullSyncDue =
    previous?.fullSyncAt == null ||
    Date.now() - Date.parse(previous.fullSyncAt) >= LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS;
  if (version.version === previous?.syncVersion && !fullSyncDue) {
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
      await replaceLedgerStartupSnapshot({
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
    return;
  }
  if (previous != null && !fullSyncDue && /^\d+$/.test(previous.syncVersion)) {
    let snapshot = previous;
    let resetRequired = false;
    for (let page = 0; page < 100 && snapshot.syncVersion !== version.version; page += 1) {
      const delta: LedgerDeltaResult = await getStreamRefreshAction(input.ledgerId, {
        ledgerId: input.ledgerId,
        afterVersion: snapshot.syncVersion,
      });
      if (delta.resetRequired) {
        resetRequired = true;
        break;
      }
      const items = mergeLedgerStartupDeltaItems(snapshot.items, delta, version.coverageLimit);
      const expectedCoverage = Math.min(version.recordCount, version.coverageLimit);
      if (delta.tombstones.length > 0 && items.length < expectedCoverage) {
        resetRequired = true;
        break;
      }
      snapshot = {
        ...snapshot,
        locale: input.locale,
        mainCurrency: input.mainCurrency,
        preferredCurrencies: input.preferredCurrencies,
        categories: input.categories,
        ledgerSettings: {
          timeZone: input.timeZone,
          collapseEntriesDefault: input.collapseEntriesDefault,
        },
        items,
        syncVersion: delta.toVersion,
        recordCount: version.recordCount,
        complete: version.complete,
        truncated: version.truncated,
        lastSyncedAt: new Date().toISOString(),
      };
      if (!delta.hasMore) break;
    }
    if (!resetRequired && snapshot.syncVersion === version.version) {
      await replaceLedgerStartupSnapshot(snapshot);
      return;
    }
  }
  const payload = await getLedgerStartupCacheSnapshot(input.ledgerId, version.version);
  if (signal.aborted) return;
  await replaceLedgerStartupSnapshot({
    key,
    schemaVersion: 5,
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
    syncVersion: payload.version,
    recordCount: payload.recordCount,
    complete: payload.complete,
    truncated: payload.truncated,
    coverageLimit: payload.coverageLimit,
    lastSyncedAt: payload.generatedAt,
    fullSyncAt: payload.generatedAt,
  });
}

/**
 * Keeps the startup preview cache in sync while the application is online.
 * The cache is a short-lived read-only preview; server data remains the
 * authoritative source and replaces it as soon as it arrives.
 */
export function LedgerStartupCacheSync(props: LedgerStartupCacheSyncProps) {
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
      void syncStartupCache(
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
        .catch(() => {})
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
    const periodicId = setInterval(run, LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS);
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 5000 });
    } else {
      timerId = setTimeout(run, 1500);
    }
    const onMutation = (event: Event) => {
      if ((event as CustomEvent<string>).detail === ledgerId) run();
    };
    const onOnline = () => run();
    window.addEventListener("cashier:ledger-mutated", onMutation);
    window.addEventListener("online", onOnline);
    return () => {
      controller.abort();
      window.removeEventListener("cashier:ledger-mutated", onMutation);
      window.removeEventListener("online", onOnline);
      if (idleId != null) window.cancelIdleCallback(idleId);
      if (timerId != null) clearTimeout(timerId);
      clearInterval(periodicId);
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
