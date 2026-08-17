"use client";

import { useEffect } from "react";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import type { LedgerDeltaResult } from "@/modules/source-document/contract-refresh";
import {
  clearUserCacheDataSafely,
  getActiveStartupCacheKey,
  reportClientCacheError,
} from "@/lib/client-cache";
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
import {
  LEDGER_MUTATION_EVENT,
  type LedgerMutationEventDetail,
} from "@/lib/mutations/ledger-mutation-event";
import { writeLedgerSyncVersion } from "@/modules/source-document/hooks/stream-refresh-cache";

const SNAPSHOT_CONFLICT_RETRY_DELAYS_MS = [100, 300] as const;
const MAX_DELTA_PAGES = 3;
const VERSION_CHECK_FRESHNESS_MS = 5 * 60 * 1000;
const STARTUP_SYNC_REQUEST_EVENT = "cashier:ledger-startup-sync-request";
const syncFlights = new Map<string, { signal: AbortSignal; flight: Promise<void> }>();
const lastVersionChecks = new Map<string, number>();

export function requestLedgerStartupCacheSync(ledgerId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ ledgerId: string; force: true }>(STARTUP_SYNC_REQUEST_EVENT, {
      detail: { ledgerId, force: true },
    })
  );
}

function isSnapshotConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === "CONFLICT" || error.message.includes("snapshot changed");
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function getSnapshotWithConflictRetry(
  input: Pick<LedgerStartupCacheSyncProps, "userId" | "ledgerId">,
  expectedVersion: string,
  signal: AbortSignal
) {
  let currentVersion = expectedVersion;
  for (let attempt = 0; attempt <= SNAPSHOT_CONFLICT_RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal.aborted) return null;
    try {
      return await getLedgerStartupCacheSnapshot(input.ledgerId, currentVersion);
    } catch (error) {
      if (!isSnapshotConflict(error) || attempt === SNAPSHOT_CONFLICT_RETRY_DELAYS_MS.length) {
        throw error;
      }
      const shouldRetry = await waitForRetry(SNAPSHOT_CONFLICT_RETRY_DELAYS_MS[attempt]!, signal);
      if (!shouldRetry) return null;
      currentVersion = (await getLedgerStartupCacheVersion(input.ledgerId)).version;
    }
  }
  return null;
}

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
    const cleared = await clearUserCacheDataSafely(
      undefined,
      input,
      "Failed to clear startup cache during user switch"
    );
    if (!cleared) {
      return;
    }
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
    for (
      let page = 0;
      page < MAX_DELTA_PAGES && snapshot.syncVersion !== version.version;
      page += 1
    ) {
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
      if (signal.aborted) return;
      await replaceLedgerStartupSnapshot(snapshot);
      writeLedgerSyncVersion(input.ledgerId, snapshot.syncVersion);
      return;
    }
  }
  const payload = await getSnapshotWithConflictRetry(input, version.version, signal);
  if (signal.aborted) return;
  if (payload == null) return;
  await replaceLedgerStartupSnapshot({
    key,
    schemaVersion: 1,
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
  writeLedgerSyncVersion(input.ledgerId, payload.version);
}

/**
 * Runs a single-flight startup cache sync for one ledger.
 *
 * A caller must never reuse a flight created with an already-aborted signal:
 * that flight aborts its work immediately, so reusing it would look like a
 * completed sync while leaving the snapshot stale. Callers whose sync effect
 * was torn down (cancelling its signal) therefore always start a fresh flight.
 * Exported for unit tests; the mounted effect is the only production caller.
 */
export async function runStartupCacheSync(
  input: LedgerStartupCacheSyncProps,
  signal: AbortSignal,
  force: boolean
): Promise<void> {
  const existing = syncFlights.get(input.ledgerId);
  if (existing != null && !existing.signal.aborted) {
    return existing.flight;
  }
  const now = Date.now();
  if (
    !force &&
    existing == null &&
    now - (lastVersionChecks.get(input.ledgerId) ?? 0) < VERSION_CHECK_FRESHNESS_MS
  ) {
    return;
  }
  const flight = syncStartupCache(input, signal).finally(() => {
    // Only the flight currently registered for this ledger is removed, so a
    // settling flight never deletes a newer flight that replaced it.
    if (syncFlights.get(input.ledgerId)?.flight === flight) {
      syncFlights.delete(input.ledgerId);
    }
  });
  syncFlights.set(input.ledgerId, { signal, flight });
  lastVersionChecks.set(input.ledgerId, now);
  return flight;
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
    const input = {
      userId,
      ledgerId,
      locale,
      mainCurrency,
      timeZone,
      collapseEntriesDefault,
      preferredCurrencies,
      categories,
    };
    const run = (force = false) => {
      if (running) {
        rerunRequested = true;
        return;
      }
      running = true;
      void runStartupCacheSync(input, controller.signal, force)
        .catch((error) => {
          if (!controller.signal.aborted) {
            reportClientCacheError(
              error,
              { userId, ledgerId },
              "Failed to synchronize ledger startup cache"
            );
          }
        })
        .finally(() => {
          running = false;
          if (rerunRequested && !controller.signal.aborted) {
            rerunRequested = false;
            timerId = setTimeout(() => run(true), 500);
          }
        });
    };
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let mutationTimerId: ReturnType<typeof setTimeout> | null = null;
    const periodicId = setInterval(() => run(false), LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS);
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => run(false), { timeout: 5000 });
    } else {
      timerId = setTimeout(() => run(false), 1500);
    }
    const onMutation = (event: Event) => {
      if ((event as CustomEvent<LedgerMutationEventDetail>).detail.ledgerId !== ledgerId) return;
      if (mutationTimerId != null) clearTimeout(mutationTimerId);
      mutationTimerId = setTimeout(() => run(true), 500);
    };
    const onForcedSync = (event: Event) => {
      if ((event as CustomEvent<{ ledgerId: string }>).detail.ledgerId === ledgerId) run(true);
    };
    const onOnline = () => run(true);
    window.addEventListener(LEDGER_MUTATION_EVENT, onMutation);
    window.addEventListener(STARTUP_SYNC_REQUEST_EVENT, onForcedSync);
    window.addEventListener("online", onOnline);
    return () => {
      controller.abort();
      window.removeEventListener(LEDGER_MUTATION_EVENT, onMutation);
      window.removeEventListener(STARTUP_SYNC_REQUEST_EVENT, onForcedSync);
      window.removeEventListener("online", onOnline);
      if (idleId != null) window.cancelIdleCallback(idleId);
      if (timerId != null) clearTimeout(timerId);
      if (mutationTimerId != null) clearTimeout(mutationTimerId);
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
