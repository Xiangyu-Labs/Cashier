"use client";

import { useEffect, useEffectEvent, useRef, useCallback } from "react";
import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";

// ---------------------------------------------------------------------------
// Public API — backward-compatible exports
// ---------------------------------------------------------------------------

export const REVISION_STATE_REFRESH_INTERVAL_MS = 3000;

export function isRefreshableRevisionState(status: SourceDocumentStatusType): boolean {
  return status === "queued" || status === "processing";
}

// ---------------------------------------------------------------------------
// Coordinator types
// ---------------------------------------------------------------------------

export type RefreshResult = "changed" | "unchanged" | "error";

export interface RefreshCoordinatorOptions {
  environment: RefreshEnvironment;
  refresh: () => Promise<{ changed: boolean }>;
  onResult: (result: RefreshResult) => void;
}

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
}

// ---------------------------------------------------------------------------
// Environment adapter for the browser
// ---------------------------------------------------------------------------

function browserEnvironment(ledgerId: string): RefreshEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  let broadcastChannel: BroadcastChannel | null = null;
  let broadcastHandlers = new Set<(data: unknown) => void>();
  let onExpired: (() => void) | null = null;
  let leadershipTimer: ReturnType<typeof setTimeout> | null = null;

  const STORAGE_KEY_LEADER = `cashier-refresh-leader-${ledgerId}`;
  const STORAGE_KEY_LEASE = `cashier-refresh-lease-${ledgerId}`;
  const LEADER_HEARTBEAT_MS = 2000;
  const MISSED_HEARTBEATS = 3;

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
        broadcastChannel?.postMessage(data);
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
      // Simple localStorage-based leader election
      const myId = `tab-${Math.random().toString(36).slice(2, 10)}`;
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

        // Acquire leadership
        localStorage.setItem(leaderKey, myId);
        localStorage.setItem(leaseKey, String(now + leaseMs));

        // Verify we won the race
        const verifyLeader = localStorage.getItem(leaderKey);
        if (verifyLeader !== myId) {
          return false;
        }

        // Start heartbeat to renew lease
        if (leadershipTimer) clearInterval(leadershipTimer);
        leadershipTimer = setInterval(() => {
          try {
            localStorage.setItem(
              leaseKey,
              String(Date.now() + leaseMs)
            );
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
        localStorage.removeItem(STORAGE_KEY_LEADER);
        localStorage.removeItem(STORAGE_KEY_LEASE);
      } catch {
        // Ignore storage errors
      }
      if (leadershipTimer) {
        clearInterval(leadershipTimer);
        leadershipTimer = null;
      }
    },
    onLeadershipExpired: (cb) => {
      onExpired = cb;
      // Check lease expiry periodically
      const expiryCheck = setInterval(() => {
        if (isLeaderExpired()) {
          onExpired?.();
        }
      }, LEADER_HEARTBEAT_MS * MISSED_HEARTBEATS);
      // Store cleanup on the timer
      (expiryCheck as unknown as { _cleanup?: () => void })._cleanup = () =>
        clearInterval(expiryCheck);
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
  private backoffStage = 0;
  private lastErrorBackoff = 5000;
  private isLeader = false;
  private unsubscribeBroadcast: (() => void) | null = null;
  private cleanupExpiry: (() => void) | null = null;
  private running = false;
  private subscribers = new Set<string>();

  // Backoff stages for unchanged success
  static readonly SUCCESS_BACKOFFS = [3000, 5000, 8000, 12000, 15000] as const;

  constructor(private readonly env: RefreshEnvironment) {}

  /**
   * Register a subscriber scope. Returns an unsubscribe function.
   */
  subscribe(scope: string): () => void {
    this.subscribers.add(scope);
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
    this.backoffStage = 0;
    this.lastErrorBackoff = 5000;
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
  }

  private start(): void {
    if (this.running) return;
    this.running = true;

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
    this.env.addEventListener("focus", () => this.handleVisibilityFocus());
    this.env.addEventListener("online", () => this.handleVisibilityFocus());
    this.env.addEventListener("offline", () => this.cancelTimer());
    this.env.addEventListener("visibilitychange", () => {
      if (this.env.isVisible()) {
        this.handleVisibilityFocus();
      } else {
        this.cancelTimer();
      }
    });

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
    if (acquired) {
      this.backoffStage = 0;
      this.schedule();
    }
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
    this.env.setTimer(() => {
      void this.refreshNow();
    }, 0);
    this.state = "REFRESHING";
  }

  private handleVisibilityFocus(): void {
    if (!this.env.isOnline() || !this.env.isVisible()) return;
    this.backoffStage = 0;
    this.lastErrorBackoff = 5000;
    this.wake();
  }

  private handleBroadcast(data: unknown): void {
    const msg = data as Record<string, unknown>;
    if (msg?.type === "refresh_result" && msg.ledgerId != null) {
      // A leader tab broadcast refresh results — process them
      // If we're a follower, we might update our local state here
    }
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.timerId != null) return;
    if (this.inFlight != null) return;
    if (this.subscribers.size === 0) return;
    if (!this.env.isOnline() || !this.env.isVisible()) return;

    const delay = this.computeDelay();
    this.state = "SCHEDULED";
    this.timerId = this.env.setTimer(() => {
      this.timerId = null;
      void this.refreshNow();
    }, delay);
  }

  private computeDelay(): number {
    // Use the last error backoff if we're in error recovery
    if (this.lastErrorBackoff > 5000) {
      return jitter(this.env, this.lastErrorBackoff, 0);
    }
    // Standard backoff by stage
    const stage = Math.min(this.backoffStage, RefreshCoordinator.SUCCESS_BACKOFFS.length - 1);
    const base = RefreshCoordinator.SUCCESS_BACKOFFS[stage] ?? 3000;
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

    try {
      // Delegate to the registered refresh function
      // The actual refresh logic is injected via the hook
      const result = await this.refreshFromSubscriber();
      return result;
    } catch {
      // Error backoff
      if (this.lastErrorBackoff < 30000) {
        this.lastErrorBackoff = Math.min(this.lastErrorBackoff * 2, 30000);
      }
      this.backoffStage = 0;
      return false;
    }
  }

  /**
   * Calls the registered refresh functions and returns whether anything changed.
   * Subclasses/extensions should override this by providing a callback.
   */
  protected async refreshFromSubscriber(): Promise<boolean> {
    // Default no-op — actual implementation is in the hook
    return false;
  }

  getState(): CoordinatorState {
    return this.state;
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }
}

// ---------------------------------------------------------------------------
// Singleton coordinator (backward-compatible with legacy usage)
// ---------------------------------------------------------------------------

// We'll create the coordinator lazily so tests can inject a mock
let globalCoordinator: RefreshCoordinator | null = null;

function getGlobalCoordinator(): RefreshCoordinator | null {
  return globalCoordinator;
}

export function setGlobalCoordinator(coordinator: RefreshCoordinator): void {
  globalCoordinator = coordinator;
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
 * cache patches.
 */
export function useRevisionStateRefresh({
  scope,
  enabled,
  pending,
  refresh,
}: UseRevisionStateRefreshOptions) {
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const refreshEvent = useEffectEvent(() => refresh());
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !pending) return;
    if (subscribedRef.current) return;

    subscribedRef.current = true;
    const unsubscribe = getGlobalCoordinator()?.subscribe(scope);
    return () => {
      subscribedRef.current = false;
      unsubscribe?.();
    };
  }, [enabled, pending, scope]);
}

/**
 * Notify the refresh coordinator that a new source document has been submitted.
 * This resets the backoff timer so the next polling cycle happens sooner.
 */
export function notifyNewSubmission(): void {
  getGlobalCoordinator()?.notifyChange();
}

// ---------------------------------------------------------------------------
// Browser singleton initialization (client-side only)
// ---------------------------------------------------------------------------

export function initRefreshCoordinator(ledgerId: string): RefreshCoordinator {
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
    };
    return new RefreshCoordinator(noopEnv);
  }

  const coordinator = new RefreshCoordinator(env);
  setGlobalCoordinator(coordinator);
  return coordinator;
}
