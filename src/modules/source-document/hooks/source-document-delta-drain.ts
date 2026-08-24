"use client";

import type { QueryClient } from "@tanstack/react-query";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import type { LedgerDeltaResult } from "@/modules/source-document/contract-refresh";
import { applyStreamRefreshToCache } from "./stream-refresh-cache";

const MAX_DRAIN_PAGES = 10;
const DRAIN_TIMEOUT_MS = 15_000;
const REFRESH_THROTTLE_MS = 3_000;

interface DrainResult {
  changed: boolean;
  result: LedgerDeltaResult;
}

interface LedgerDrainState {
  version: string;
  inFlight: Promise<DrainResult> | null;
  lastStartedAt: number;
  lastResult: DrainResult | null;
}

const drainsByClient = new WeakMap<QueryClient, Map<string, LedgerDrainState>>();

function stateFor(queryClient: QueryClient, ledgerId: string, afterVersion: string) {
  let drains = drainsByClient.get(queryClient);
  if (drains == null) {
    drains = new Map();
    drainsByClient.set(queryClient, drains);
  }
  let state = drains.get(ledgerId);
  if (state == null) {
    state = { version: afterVersion, inFlight: null, lastStartedAt: 0, lastResult: null };
    drains.set(ledgerId, state);
  } else if (BigInt(afterVersion) > BigInt(state.version)) {
    state.version = afterVersion;
  }
  return state;
}

function mergeResults(results: LedgerDeltaResult[]): LedgerDeltaResult {
  const first = results[0]!;
  const last = results.at(-1)!;
  return {
    ...last,
    fromVersion: first.fromVersion,
    changed: results.some((result) => result.changed),
    resetRequired: results.some((result) => result.resetRequired) || last.hasMore,
    hasMore: false,
    hasTransitionalWork: results.some((result) => result.hasTransitionalWork),
    invalidations: {
      categories: results.some((result) => result.invalidations.categories),
      settings: results.some((result) => result.invalidations.settings),
      stats: results.some((result) => result.invalidations.stats),
    },
  };
}

export function drainSourceDocumentDelta(
  queryClient: QueryClient,
  ledgerId: string,
  afterVersion: string
): Promise<DrainResult> {
  const state = stateFor(queryClient, ledgerId, afterVersion);
  if (state.inFlight != null) return state.inFlight;
  const now = Date.now();
  if (state.lastResult != null && now - state.lastStartedAt < REFRESH_THROTTLE_MS) {
    return Promise.resolve(state.lastResult);
  }

  let timedOut = false;
  state.lastStartedAt = now;
  const work = (async () => {
    const results: LedgerDeltaResult[] = [];
    let candidateVersion = state.version;
    for (let page = 0; page < MAX_DRAIN_PAGES; page += 1) {
      const result = await getStreamRefreshAction(ledgerId, {
        ledgerId,
        afterVersion: candidateVersion,
      });
      if (timedOut) throw new Error("Source document delta drain timed out");
      results.push(result);
      candidateVersion = result.toVersion;
      if (!result.hasMore || result.resetRequired) break;
    }
    const merged = mergeResults(results);
    await applyStreamRefreshToCache(queryClient, ledgerId, merged);
    if (timedOut) throw new Error("Source document delta drain timed out");
    state.version = candidateVersion;
    return { changed: merged.changed, result: merged };
  })();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Source document delta drain timed out"));
    }, DRAIN_TIMEOUT_MS);
  });
  const inFlight = Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
  state.inFlight = inFlight;
  void work.then(
    () => {
      if (state.inFlight === inFlight) state.inFlight = null;
    },
    () => {
      if (state.inFlight === inFlight) state.inFlight = null;
    }
  );
  void inFlight.then(
    (result) => {
      state.lastResult = result;
    },
    () => {
      state.lastResult = null;
    }
  );
  return inFlight;
}
