"use client";

import { useEffect, useEffectEvent } from "react";
import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";

export const REVISION_STATE_REFRESH_INTERVAL_MS = 3000;

/**
 * Backoff stages for the refresh coordinator.
 * Starts at 3s and backs off through each stage to at most 15s.
 */
const BACKOFF_STAGES = [3000, 5000, 8000, 12000, 15000] as const;
const MAX_BACKOFF_STAGE = BACKOFF_STAGES.length - 1;

type Refresh = () => Promise<unknown>;

interface RefreshRegistration {
  callbacks: Set<Refresh>;
}

export interface RevisionStateRefreshEnvironment {
  addWindowListener: (type: "focus" | "online" | "offline", listener: () => void) => void;
  removeWindowListener: (type: "focus" | "online" | "offline", listener: () => void) => void;
  addVisibilityListener: (listener: () => void) => void;
  removeVisibilityListener: (listener: () => void) => void;
  isVisible: () => boolean;
  isOnline: () => boolean;
  setTimer: (listener: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  queueTask: (listener: () => void) => void;
}

function browserEnvironment(): RevisionStateRefreshEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  return {
    addWindowListener: (type, listener) => window.addEventListener(type, listener),
    removeWindowListener: (type, listener) => window.removeEventListener(type, listener),
    addVisibilityListener: (listener) => document.addEventListener("visibilitychange", listener),
    removeVisibilityListener: (listener) =>
      document.removeEventListener("visibilitychange", listener),
    isVisible: () => document.visibilityState === "visible",
    isOnline: () => navigator.onLine,
    setTimer: (listener, delay) => setTimeout(listener, delay),
    clearTimer: (timer) => clearTimeout(timer),
    queueTask: (listener) => queueMicrotask(listener),
  };
}

export class RevisionStateRefreshCoordinator {
  private readonly registrations = new Map<string, RefreshRegistration>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private listenersAttached = false;
  private wakeQueued = false;
  private backoffStage = 0;

  private consecutiveNoOpRefreshes = 0;

  constructor(private readonly environment: RevisionStateRefreshEnvironment | null) {}

  /**
   * Reset backoff to initial stage. Called on new submission, window focus, or reconnect.
   */
  resetBackoff() {
    this.backoffStage = 0;
    this.consecutiveNoOpRefreshes = 0;
  }

  subscribe(scope: string, refresh: Refresh): () => void {
    const registration = this.registrations.get(scope) ?? { callbacks: new Set<Refresh>() };
    registration.callbacks.add(refresh);
    this.registrations.set(scope, registration);
    this.attachListeners();
    this.schedule();

    return () => {
      const current = this.registrations.get(scope);
      current?.callbacks.delete(refresh);
      if (current?.callbacks.size === 0) this.registrations.delete(scope);
      if (this.registrations.size === 0) this.stop();
    };
  }

  private readonly handleVisibility = () => {
    if (this.environment?.isVisible() === true) {
      this.resetBackoff();
      this.queueImmediateRefresh();
    }
  };

  private readonly handleFocus = () => {
    this.resetBackoff();
    this.queueImmediateRefresh();
  };

  private readonly handleOnline = () => {
    this.resetBackoff();
    this.queueImmediateRefresh();
  };

  private readonly handleOffline = () => this.clearScheduledRefresh();

  private attachListeners() {
    if (this.environment == null || this.listenersAttached) return;
    this.environment.addWindowListener("focus", this.handleFocus);
    this.environment.addWindowListener("online", this.handleOnline);
    this.environment.addWindowListener("offline", this.handleOffline);
    this.environment.addVisibilityListener(this.handleVisibility);
    this.listenersAttached = true;
  }

  private detachListeners() {
    if (this.environment == null || !this.listenersAttached) return;
    this.environment.removeWindowListener("focus", this.handleFocus);
    this.environment.removeWindowListener("online", this.handleOnline);
    this.environment.removeWindowListener("offline", this.handleOffline);
    this.environment.removeVisibilityListener(this.handleVisibility);
    this.listenersAttached = false;
  }

  private queueImmediateRefresh() {
    if (this.environment == null || this.wakeQueued || !this.environment.isOnline()) return;
    this.wakeQueued = true;
    this.environment.queueTask(() => {
      this.wakeQueued = false;
      void this.refreshNow();
    });
  }

  private schedule() {
    if (
      this.environment == null ||
      this.timer != null ||
      this.inFlight != null ||
      this.registrations.size === 0 ||
      !this.environment.isOnline()
    ) {
      return;
    }

    const delay = BACKOFF_STAGES[Math.min(this.backoffStage, MAX_BACKOFF_STAGE)] ?? BACKOFF_STAGES[0];

    this.timer = this.environment.setTimer(() => {
      this.timer = null;
      void this.refreshNow();
    }, delay);
  }

  private clearScheduledRefresh() {
    if (this.environment == null || this.timer == null) return;
    this.environment.clearTimer(this.timer);
    this.timer = null;
  }

  private refreshNow(): Promise<void> {
    if (this.environment == null || !this.environment.isOnline()) {
      this.clearScheduledRefresh();
      return Promise.resolve();
    }
    if (this.inFlight != null) return this.inFlight;

    this.clearScheduledRefresh();

    // Collect unique refresh callbacks (one per registration)
    const refreshes = [...this.registrations.values()].flatMap((registration) => {
      const first = registration.callbacks.values().next().value as Refresh | undefined;
      return first == null ? [] : [first];
    });
    if (refreshes.length === 0) return Promise.resolve();

    this.inFlight = Promise.allSettled(refreshes.map((refresh) => refresh())).then(
      () => undefined
    );
    void this.inFlight.finally(() => {
      this.inFlight = null;

      // After a successful refresh cycle, advance backoff stage
      // (will be reset by focus/online/submission events)
      if (this.backoffStage < MAX_BACKOFF_STAGE) {
        this.backoffStage++;
      }

      // Check if there are still pending registrations; if not, stop
      if (this.registrations.size === 0) {
        this.stop();
        return;
      }

      this.schedule();
    });
    return this.inFlight;
  }

  private stop() {
    this.clearScheduledRefresh();
    this.detachListeners();
    this.backoffStage = 0;
    this.consecutiveNoOpRefreshes = 0;
  }
}

const revisionStateRefreshCoordinator = new RevisionStateRefreshCoordinator(browserEnvironment());

export function isRefreshableRevisionState(status: SourceDocumentStatusType): boolean {
  return status === "queued" || status === "processing";
}

interface UseRevisionStateRefreshOptions {
  scope: string;
  enabled: boolean;
  pending: boolean;
  refresh: Refresh;
}

export function useRevisionStateRefresh({
  scope,
  enabled,
  pending,
  refresh,
}: UseRevisionStateRefreshOptions) {
  const refreshEvent = useEffectEvent(() => refresh());

  useEffect(() => {
    if (!enabled || !pending) return;
    return revisionStateRefreshCoordinator.subscribe(scope, refreshEvent);
  }, [enabled, pending, scope]);
}
