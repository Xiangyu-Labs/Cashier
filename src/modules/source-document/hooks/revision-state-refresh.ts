"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import { STREAM_REFRESH_PROTOCOL_VERSION } from "@/modules/source-document/contract-refresh";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";

// ---------------------------------------------------------------------------
// Public API — backward-compatible exports
// ---------------------------------------------------------------------------

export const REVISION_STATE_REFRESH_INTERVAL_MS = 3000;

export function isRefreshableRevisionState(status: SourceDocumentStatusType): boolean {
  return status === "processing";
}

// ---------------------------------------------------------------------------
// Coordinator types
// ---------------------------------------------------------------------------

export type RefreshResult = "changed" | "unchanged" | "error";

export interface RefreshEnvironment {
  now(): number;
  random(): number;
  setTimer(cb: () => void, ms: number): string;
  clearTimer(id: string): void;
  isVisible(): boolean;
  isOnline(): boolean;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
  broadcastChannelName: string;
  broadcast(data: unknown): void;
  onBroadcast(cb: (data: unknown) => void): () => void;
  acquireLeadership(leaseMs: number): Promise<boolean>;
  releaseLeadership(): void;
  onLeadershipExpired(cb: () => void): void;
  isLeadershipAvailable(): boolean;
  destroy?(): void;
}

// ---------------------------------------------------------------------------
// Environment adapter for the browser
// ---------------------------------------------------------------------------

function browserEnvironment(ledgerId: string): RefreshEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  let broadcastChannel: BroadcastChannel | null = null;
  const broadcastHandlers = new Set<(data: unknown) => void>();
  let onExpired: (() => void) | null = null;
  let leadershipTimer: ReturnType<typeof setTimeout> | null = null;
  let expiryCheckTimer: ReturnType<typeof setInterval> | null = null;

  const STORAGE_KEY_LEADER = `cashier-refresh-leader-${ledgerId}`;
  const STORAGE_KEY_LEASE = `cashier-refresh-lease-${ledgerId}`;
  const STORAGE_KEY_BROADCAST = `cashier-refresh-result-${ledgerId}`;
  const LEADER_HEARTBEAT_MS = 2000;
  const MISSED_HEARTBEATS = 3;

  // I2: Stable per-tab token — generated once when the environment is created
  const myId = `tab-${Math.random().toString(36).slice(2, 10)}`;

  const handleStorageBroadcast = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY_BROADCAST || event.newValue == null) return;
    try {
      const message = JSON.parse(event.newValue) as { data?: unknown };
      for (const handler of broadcastHandlers) handler(message.data);
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  window.addEventListener("storage", handleStorageBroadcast);

  try {
    broadcastChannel = new BroadcastChannel(`cashier-refresh-${ledgerId}`);
    broadcastChannel.onmessage = (event: MessageEvent) => {
      for (const handler of broadcastHandlers) {
        handler(event.data);
      }
    };
  } catch {
    // BroadcastChannel not supported — fall back to no-op
  }

  function getLeaderTimestamp(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LEASE);
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  }

  function isLeaderExpired(): boolean {
    const ts = getLeaderTimestamp();
    if (ts === 0) return true;
    return Date.now() > ts;
  }

  function cleanupIntervals(): void {
    if (leadershipTimer) {
      clearInterval(leadershipTimer);
      leadershipTimer = null;
    }
    if (expiryCheckTimer) {
      clearInterval(expiryCheckTimer);
      expiryCheckTimer = null;
    }
  }

  return {
    now: () => Date.now(),
    random: () => Math.random(),
    setTimer: (cb, ms) => {
      const id = setTimeout(cb, ms);
      return String(id);
    },
    clearTimer: (id) => {
      clearTimeout(Number(id));
    },
    isVisible: () => document.visibilityState === "visible",
    isOnline: () => navigator.onLine,
    addEventListener: (type, cb) => {
      if (type === "visibilitychange") {
        document.addEventListener(type, cb);
      } else {
        window.addEventListener(type, cb);
      }
    },
    removeEventListener: (type, cb) => {
      if (type === "visibilitychange") {
        document.removeEventListener(type, cb);
      } else {
        window.removeEventListener(type, cb);
      }
    },
    broadcastChannelName: `cashier-refresh-${ledgerId}`,
    broadcast: (data) => {
      try {
        if (broadcastChannel != null) {
          broadcastChannel.postMessage(data);
        } else {
          localStorage.setItem(
            STORAGE_KEY_BROADCAST,
            JSON.stringify({ id: crypto.randomUUID(), data })
          );
        }
      } catch {
        // Ignore broadcast failures
      }
    },
    onBroadcast: (cb) => {
      broadcastHandlers.add(cb);
      return () => {
        broadcastHandlers.delete(cb);
      };
    },
    acquireLeadership: async (leaseMs) => {
      const leaderKey = `cashier-refresh-leader-${ledgerId}`;
      const leaseKey = `cashier-refresh-lease-${ledgerId}`;

      try {
        const currentLeader = localStorage.getItem(leaderKey);
        const leaseEnd = localStorage.getItem(leaseKey);
        const now = Date.now();

        // Check if current leader is still valid
        if (currentLeader && leaseEnd && Number(leaseEnd) > now) {
          return false;
        }

        // Acquire leadership with stable per-tab token
        localStorage.setItem(leaderKey, myId);
        localStorage.setItem(leaseKey, String(now + leaseMs));

        // Verify we won the race
        const verifyLeader = localStorage.getItem(leaderKey);
        if (verifyLeader !== myId) {
          return false;
        }

        // Start heartbeat to renew lease
        cleanupIntervals();
        leadershipTimer = setInterval(() => {
          try {
            localStorage.setItem(leaseKey, String(Date.now() + leaseMs));
            // Broadcast heartbeat
            broadcastChannel?.postMessage({
              type: "heartbeat",
              leader: myId,
              timestamp: Date.now(),
            });
          } catch {
            // Storage full or unavailable
          }
        }, LEADER_HEARTBEAT_MS);

        return true;
      } catch {
        return false;
      }
    },
    releaseLeadership: () => {
      try {
        // I2: Only release lease if our token matches
        const currentLeader = localStorage.getItem(STORAGE_KEY_LEADER);
        if (currentLeader === myId) {
          localStorage.removeItem(STORAGE_KEY_LEADER);
          localStorage.removeItem(STORAGE_KEY_LEASE);
        }
      } catch {
        // Ignore storage errors
      }
      cleanupIntervals();
    },
    onLeadershipExpired: (cb) => {
      onExpired = cb;
      // Check lease expiry periodically
      expiryCheckTimer = setInterval(() => {
        if (isLeaderExpired()) {
          onExpired?.();
        }
      }, LEADER_HEARTBEAT_MS * MISSED_HEARTBEATS);
    },
    isLeadershipAvailable: () => {
      try {
        const PROBE_KEY = "__cashier_leadership_probe__";
        localStorage.setItem(PROBE_KEY, "1");
        const readBack = localStorage.getItem(PROBE_KEY);
        localStorage.removeItem(PROBE_KEY);
        return readBack === "1";
      } catch {
        return false;
      }
    },
    destroy: () => {
      cleanupIntervals();
      window.removeEventListener("storage", handleStorageBroadcast);
      if (typeof broadcastChannel?.close === "function") broadcastChannel.close();
      broadcastChannel = null;
      broadcastHandlers.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Jitter helpers
// ---------------------------------------------------------------------------

function jitter(env: RefreshEnvironment, base: number, range: number): number {
  return base + env.random() * range;
}

// ---------------------------------------------------------------------------
// Coordinator class
// ---------------------------------------------------------------------------

type CoordinatorState = "IDLE" | "SCHEDULED" | "REFRESHING" | "BACKING_OFF";

export class RefreshCoordinator {
  private state: CoordinatorState = "IDLE";
  private timerId: string | null = null;
  private inFlight: Promise<boolean> | null = null;
  private errorBackoffMs: number | null = null;
  private isLeader = false;
  private unsubscribeBroadcast: (() => void) | null = null;
  private cleanupExpiry: (() => void) | null = null;
  private running = false;
  private hasTransitionalWork = true;
  private pollingStartedAt = 0;
  private subscribers = new Map<
    string,
    { refresh: () => Promise<{ changed: boolean; result?: StreamRefreshResult }> }
  >();
  private applyCacheFromRefresh: ((result: StreamRefreshResult) => void) | null = null;
  private readonly focusHandler = () => this.handleVisibilityFocus();
  private readonly offlineHandler = () => this.cancelTimer();
  private readonly visibilityHandler = () => {
    if (this.env.isVisible()) this.handleVisibilityFocus();
    else this.cancelTimer();
  };

  constructor(private readonly env: RefreshEnvironment) {}

  /**
   * Register a callback that applies refresh results to the TanStack cache.
   */
  setApplyCacheCallback(cb: (result: StreamRefreshResult) => void): void {
    this.applyCacheFromRefresh = cb;
  }

  /**
   * Register a subscriber scope with its refresh callback. Returns an unsubscribe function.
   */
  subscribe(
    scope: string,
    refreshFn: () => Promise<{ changed: boolean; result?: StreamRefreshResult }>
  ): () => void {
    this.subscribers.set(scope, { refresh: refreshFn });
    if (!this.running) {
      this.start();
    }
    this.wake();
    return () => {
      this.subscribers.delete(scope);
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  /**
   * Notify of a relevant event (new submission, mutation, etc.).
   * Cancels any pending timer and queues an immediate single-flight refresh.
   */
  notifyChange(): void {
    this.hasTransitionalWork = true;
    this.pollingStartedAt = this.env.now();
    this.errorBackoffMs = null;
    this.wake();
  }

  /**
   * Cancel any pending timer and immediately queue one refresh cycle.
   */
  wake(): void {
    this.cancelTimer();
    this.queueImmediate();
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.stop();
    this.subscribers.clear();
    this.env.destroy?.();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.pollingStartedAt = this.env.now();

    // Set up broadcast listener
    this.unsubscribeBroadcast = this.env.onBroadcast((data) => {
      this.handleBroadcast(data);
    });

    // Set up leadership expiration
    this.env.onLeadershipExpired(() => {
      this.isLeader = false;
      this.tryAcquireLeadership();
    });

    // Attach window/visibility listeners
    this.env.addEventListener("focus", this.focusHandler);
    this.env.addEventListener("online", this.focusHandler);
    this.env.addEventListener("offline", this.offlineHandler);
    this.env.addEventListener("visibilitychange", this.visibilityHandler);

    // Try to become leader
    this.tryAcquireLeadership().then(() => {
      if (this.isLeader || this.subscribers.size > 0) {
        this.schedule();
      }
    });
  }

  private stop(): void {
    this.running = false;
    this.cancelTimer();
    this.env.releaseLeadership();
    this.env.removeEventListener("focus", this.focusHandler);
    this.env.removeEventListener("online", this.focusHandler);
    this.env.removeEventListener("offline", this.offlineHandler);
    this.env.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.unsubscribeBroadcast) {
      this.unsubscribeBroadcast();
      this.unsubscribeBroadcast = null;
    }
    this.state = "IDLE";
    this.inFlight = null;
    this.isLeader = false;
  }

  private async tryAcquireLeadership(): Promise<void> {
    const acquired = await this.env.acquireLeadership(30000);
    this.isLeader = acquired;
    this.schedule();
  }

  private cancelTimer(): void {
    if (this.timerId != null) {
      this.env.clearTimer(this.timerId);
      this.timerId = null;
    }
    this.state = this.inFlight ? "REFRESHING" : this.subscribers.size > 0 ? "BACKING_OFF" : "IDLE";
  }

  private queueImmediate(): void {
    if (!this.env.isOnline() || !this.env.isVisible()) return;
    if (this.inFlight != null) return; // Single-flight

    this.cancelTimer();
    // Schedule ASAP (microtask)
    this.timerId = this.env.setTimer(() => {
      this.timerId = null;
      void this.refreshNow();
    }, 0);
    this.state = "REFRESHING";
  }

  private handleVisibilityFocus(): void {
    if (!this.env.isOnline() || !this.env.isVisible()) return;
    this.errorBackoffMs = null;
    this.wake();
  }

  private handleBroadcast(data: unknown): void {
    const msg = data as Record<string, unknown>;
    if (msg?.type === "refresh_result" && msg.result != null) {
      const result = msg.result as StreamRefreshResult;
      // Reject mismatched protocol version
      if (result.protocolVersion !== STREAM_REFRESH_PROTOCOL_VERSION) return;
      // Apply to local cache via registered callback
      this.applyCacheFromRefresh?.(result);
    }
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.timerId != null) return;
    if (this.inFlight != null) return;
    if (this.subscribers.size === 0) return;
    if (!this.hasTransitionalWork) return;
    if (!this.env.isOnline() || !this.env.isVisible()) return;

    const delay = this.computeDelay();
    this.state = "SCHEDULED";
    this.timerId = this.env.setTimer(() => {
      this.timerId = null;
      void this.refreshNow();
    }, delay);
  }

  private computeDelay(): number {
    if (this.errorBackoffMs != null) {
      return this.errorBackoffMs;
    }
    const elapsed = this.env.now() - this.pollingStartedAt;
    const base = elapsed < 30_000 ? 2_000 : elapsed < 120_000 ? 5_000 : 10_000;
    return jitter(this.env, base, base * 0.3);
  }

  private refreshNow(): Promise<void> {
    if (this.inFlight != null) return this.inFlight.then(() => {});

    this.state = "REFRESHING";
    this.inFlight = this.doRefresh();
    void this.inFlight.finally(() => {
      this.inFlight = null;
      this.state = this.subscribers.size > 0 ? "BACKING_OFF" : "IDLE";
      this.schedule();
    });
    return this.inFlight.then(() => {});
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.env.isOnline()) return false;
    if (!this.env.isVisible()) return false;

    let anyChanged = false;
    let allSuccessfulResultsAreTerminal = true;
    let hadSuccessfulResult = false;
    let hadError = false;

    for (const [, entry] of this.subscribers) {
      try {
        const { changed, result } = await entry.refresh();
        if (changed) {
          anyChanged = true;
        }
        if (result != null) {
          hadSuccessfulResult = true;
          if (result.hasTransitionalWork !== false) allSuccessfulResultsAreTerminal = false;
        } else {
          allSuccessfulResultsAreTerminal = false;
        }
        if (this.isLeader && result != null) {
          this.env.broadcast({
            type: "refresh_result",
            protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
            result,
          });
        }
      } catch {
        hadError = true;
      }
    }

    if (hadError) {
      this.errorBackoffMs = Math.min((this.errorBackoffMs ?? 2_500) * 2, 30_000);
    } else {
      this.errorBackoffMs = null;
    }

    // Errors and incomplete responses are never terminal processing states.
    this.hasTransitionalWork = hadError || !hadSuccessfulResult || !allSuccessfulResultsAreTerminal;

    return anyChanged;
  }

  getState(): CoordinatorState {
    return this.state;
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }

  getEnv(): RefreshEnvironment {
    return this.env;
  }
}

// ---------------------------------------------------------------------------
// Singleton coordinator (backward-compatible with legacy usage)
// ---------------------------------------------------------------------------

// We'll create the coordinator lazily so tests can inject a mock
let globalCoordinator: RefreshCoordinator | null = null;
const RefreshCoordinatorContext = createContext<RefreshCoordinator | null>(null);

function getGlobalCoordinator(): RefreshCoordinator | null {
  return globalCoordinator;
}

export function setGlobalCoordinator(coordinator: RefreshCoordinator): void {
  globalCoordinator = coordinator;
}

export function RevisionStateRefreshProvider({
  ledgerId,
  children,
}: {
  ledgerId: string;
  children: ReactNode;
}) {
  return createElement(RefreshCoordinatorScope, { key: ledgerId, ledgerId }, children);
}

function RefreshCoordinatorScope({
  ledgerId,
  children,
}: {
  ledgerId: string;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [coordinator] = useState(() => initRefreshCoordinator(ledgerId, queryClient));

  useEffect(() => {
    return () => coordinator.destroy();
  }, [coordinator]);

  return createElement(RefreshCoordinatorContext.Provider, { value: coordinator }, children);
}

// ---------------------------------------------------------------------------
// Hook API
// ---------------------------------------------------------------------------

interface UseRevisionStateRefreshOptions {
  scope: string;
  enabled: boolean;
  pending: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * useRevisionStateRefresh — backward-compatible hook that registers a refresh
 * callback with the global coordinator.
 *
 * The `refresh` callback should call the bounded refresh action and apply
 * cache patches. It should return `{ changed, result? }`.
 *
 * The hook passes the refresh callback to subscribe() so the coordinator
 * can call it during the local page's polling cycles.
 */
export function useRevisionStateRefresh({
  scope,
  enabled,
  pending,
  refresh,
}: UseRevisionStateRefreshOptions) {
  const contextCoordinator = useContext(RefreshCoordinatorContext);
  const refreshEvent = useEffectEvent(() => refresh());

  useEffect(() => {
    if (!enabled || !pending) return;
    const coordinator = contextCoordinator ?? getGlobalCoordinator();
    if (coordinator == null) return;
    // C1: Pass the refresh callback to subscribe
    const unsubscribe = coordinator?.subscribe(scope, async () => {
      const r = await refreshEvent();
      return {
        changed: (r as { changed: boolean }).changed,
        result: (r as { result?: StreamRefreshResult }).result,
      } as { changed: boolean; result?: StreamRefreshResult };
    });

    return () => {
      unsubscribe?.();
    };
  }, [contextCoordinator, enabled, pending, scope]);
}

/**
 * Notify the refresh coordinator that a new source document has been submitted.
 * This resets the backoff timer so the next polling cycle happens sooner.
 */
export function useNotifyRevisionRefresh(): () => void {
  const contextCoordinator = useContext(RefreshCoordinatorContext);
  return () => (contextCoordinator ?? getGlobalCoordinator())?.notifyChange();
}

/** @deprecated Prefer useNotifyRevisionRefresh inside React components. */
export function notifyNewSubmission(): void {
  getGlobalCoordinator()?.notifyChange();
}

// ---------------------------------------------------------------------------
// Browser singleton initialization (client-side only)
// ---------------------------------------------------------------------------

export function initRefreshCoordinator(
  ledgerId: string,
  queryClient?: QueryClient
): RefreshCoordinator {
  const env = browserEnvironment(ledgerId);
  if (env == null) {
    // SSR — return a no-op coordinator
    const noopEnv: RefreshEnvironment = {
      now: () => 0,
      random: () => 0,
      setTimer: () => "",
      clearTimer: () => {},
      isVisible: () => false,
      isOnline: () => false,
      addEventListener: () => {},
      removeEventListener: () => {},
      broadcastChannelName: "",
      broadcast: () => {},
      onBroadcast: () => () => {},
      acquireLeadership: async () => false,
      releaseLeadership: () => {},
      onLeadershipExpired: () => {},
      isLeadershipAvailable: () => false,
    };
    return new RefreshCoordinator(noopEnv);
  }

  const coordinator = new RefreshCoordinator(env);
  if (queryClient) {
    coordinator.setApplyCacheCallback((result) =>
      applyStreamRefreshToCache(queryClient, ledgerId, result)
    );
  }
  setGlobalCoordinator(coordinator);
  return coordinator;
}
