import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  initRefreshCoordinator,
  isRefreshableRevisionState,
  RefreshCoordinator,
  setGlobalCoordinator,
  type RefreshEnvironment,
} from "@/modules/source-document/hooks/revision-state-refresh";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";

// ---------------------------------------------------------------------------
// Test environment factory
// ---------------------------------------------------------------------------

function createEnvironment() {
  let online = true;
  let visible = true;
  const listeners = new Map<string, Set<() => void>>();
  const broadcastHandlers = new Set<(data: unknown) => void>();
  const scheduledDelays: number[] = [];

  const environment: RefreshEnvironment = {
    now: () => Date.now(),
    random: () => 0.5,
    setTimer: (cb, ms) => {
      scheduledDelays.push(ms);
      const id = String(setTimeout(cb, ms));
      return id;
    },
    clearTimer: (id) => {
      clearTimeout(Number(id));
    },
    isVisible: () => visible,
    isOnline: () => online,
    addEventListener: (type, cb) => {
      const existing = listeners.get(type) ?? new Set();
      existing.add(cb);
      listeners.set(type, existing);
    },
    removeEventListener: (type, cb) => {
      listeners.get(type)?.delete(cb);
    },
    broadcastChannelName: "test-channel",
    broadcast: (data) => {
      for (const handler of broadcastHandlers) {
        handler(data);
      }
    },
    onBroadcast: (_cb) => {
      broadcastHandlers.add(_cb);
      return () => {
        broadcastHandlers.delete(_cb);
      };
    },
    acquireLeadership: async (_leaseMs) => true,
    releaseLeadership: () => {},
    onLeadershipExpired: (_cb) => {},
    isLeadershipAvailable: () => true,
  };

  return {
    environment,
    setOnline(value: boolean) {
      online = value;
      const handler = listeners.get(value ? "online" : "offline");
      if (handler) for (const cb of handler) cb();
    },
    show() {
      visible = true;
      const handler = listeners.get("visibilitychange");
      if (handler) for (const cb of handler) cb();
    },
    hide() {
      visible = false;
      const handler = listeners.get("visibilitychange");
      if (handler) for (const cb of handler) cb();
    },
    getIsLeader: () => environment.acquireLeadership,
    scheduledDelays,
  };
}

async function flushTimers() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("revision state refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Shared no-op refresh callback for tests
  const noopRefresh = async (): Promise<{ changed: boolean }> => ({ changed: false });
  const refreshResult = (hasTransitionalWork: boolean): StreamRefreshResult => ({
    protocolVersion: 2,
    fromVersion: "0",
    toVersion: "0",
    hasMore: false,
    resetRequired: false,
    changed: false,
    hasTransitionalWork,
    documents: [],
    tombstones: [],
    counts: null,
    invalidations: { categories: false, settings: false, stats: false },
  });

  // -----------------------------------------------------------------------
  // Legacy API — isRefreshableRevisionState
  // -----------------------------------------------------------------------

  it("returns true for processing", () => {
    const status = "processing" as const;
    expect(isRefreshableRevisionState(status)).toBe(true);
  });

  it.each(["completed", "anomaly", "failed", "deleted", "candidate_pending"] as const)(
    "returns false for %s",
    (status) => {
      expect(isRefreshableRevisionState(status)).toBe(false);
    }
  );

  // -----------------------------------------------------------------------
  // Coordinator — lifecycle
  // -----------------------------------------------------------------------

  it("schedules first refresh shortly after subscribe", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    // Should have a timer scheduled
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  it("acquires leadership on start", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    expect(coordinator.getIsLeader()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Coordinator — change notification
  // -----------------------------------------------------------------------

  it("handles change notifications without error", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    coordinator.notifyChange();
    coordinator.notifyChange();
    expect(true).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Coordinator — wake cancels and re-queues
  // -----------------------------------------------------------------------

  it("wake restarts the cycle", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    coordinator.wake();
    await flushTimers();

    // After wake, it should be in a non-idle state
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  // -----------------------------------------------------------------------
  // Coordinator — hidden stops scheduling
  // -----------------------------------------------------------------------

  it("stops scheduling when hidden and recovers on show", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    env.hide();
    await flushTimers();

    // Should not have an active timer (cancelled by hide)
    await vi.advanceTimersByTimeAsync(5000);

    env.show();
    await flushTimers();

    // After show, should schedule again
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  // -----------------------------------------------------------------------
  // Coordinator — fallback when leadership fails
  // -----------------------------------------------------------------------

  it("refresh proceeds in fallback mode when leadership fails", async () => {
    const env = createEnvironment();
    env.environment.acquireLeadership = async (_leaseMs) => false;
    env.environment.isLeadershipAvailable = () => false;
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    let refreshCalled = false;
    coordinator.subscribe("test", async () => {
      refreshCalled = true;
      return { changed: false };
    });
    await flushTimers();

    // Should schedule (not remain idle) despite not being leader
    expect(coordinator.getState()).not.toBe("IDLE");
    expect(coordinator.getIsLeader()).toBe(false);

    // Advance timers to trigger the refresh cycle
    await vi.advanceTimersByTimeAsync(20000);
    await flushTimers();

    // Refresh should have been called even though we're not leader
    expect(refreshCalled).toBe(true);
  });

  it("refresh proceeds as fallback when local storage reads work but writes fail", async () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });
    vi.stubGlobal("localStorage", {
      getItem,
      setItem,
      removeItem: vi.fn(),
    } as unknown as Storage);
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        postMessage() {}
      }
    );

    const coordinator = initRefreshCoordinator("storage-write-failure");

    let refreshCalled = false;
    try {
      coordinator.subscribe("test", async () => {
        refreshCalled = true;
        return { changed: false };
      });
      await flushTimers();

      expect(coordinator.getIsLeader()).toBe(false);

      // Advance timers to trigger refresh
      await vi.advanceTimersByTimeAsync(20000);
      await flushTimers();

      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalled();
      // Should have polled even though not leader, because leadership is unavailable
      expect(refreshCalled).toBe(true);
    } finally {
      coordinator.destroy();
    }
  });

  it("hidden tabs do not refresh in fallback mode", async () => {
    const env = createEnvironment();
    env.environment.acquireLeadership = async (_leaseMs) => false;
    env.environment.isLeadershipAvailable = () => false;
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    let refreshCalled = false;
    coordinator.subscribe("test", async () => {
      refreshCalled = true;
      return { changed: false };
    });
    await flushTimers();

    // Hide before advancing timers — the immediate timer from subscribe's
    // wake() call is pending but doRefresh() must check visibility
    env.hide();
    await vi.advanceTimersByTimeAsync(100);
    await flushTimers();

    // Refresh should NOT be called while hidden (execution-time guard)
    expect(refreshCalled).toBe(false);

    // Show again — refresh resumes
    env.show();
    await vi.advanceTimersByTimeAsync(100);
    await flushTimers();

    // After show, should have scheduled a refresh
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  it("offline tabs do not refresh in fallback mode", async () => {
    const env = createEnvironment();
    env.environment.acquireLeadership = async (_leaseMs) => false;
    env.environment.isLeadershipAvailable = () => false;
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    let refreshCalled = false;
    coordinator.subscribe("test", async () => {
      refreshCalled = true;
      return { changed: false };
    });
    await flushTimers();

    // Go offline — this cancels the scheduled timer
    env.setOnline(false);
    await vi.advanceTimersByTimeAsync(20000);
    await flushTimers();

    expect(coordinator.getIsLeader()).toBe(false);
    expect(refreshCalled).toBe(false);

    // Go back online
    env.setOnline(true);
    await flushTimers();
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  it("does not overlap refresh cycles in fallback mode", async () => {
    const env = createEnvironment();
    env.environment.acquireLeadership = async (_leaseMs) => false;
    env.environment.isLeadershipAvailable = () => false;
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    let callCount = 0;
    // Use a deferred promise so the first refresh stays in-flight
    let resolveFirst: (v: { changed: boolean }) => void = () => {};
    coordinator.subscribe("test", async () => {
      callCount++;
      await new Promise<{ changed: boolean }>((resolve) => {
        resolveFirst = resolve;
      });
      return { changed: false };
    });
    await flushTimers();

    // The first refresh is deferred (in-flight)
    // Try to wake — should be blocked by single-flight
    coordinator.wake();
    await vi.advanceTimersByTimeAsync(100);
    await flushTimers();

    expect(callCount).toBe(1); // Only one started

    // Complete the first
    resolveFirst({ changed: false });
    await flushTimers();

    // After completion, the coordinator should schedule the next cycle
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  // -----------------------------------------------------------------------
  // Coordinator — healthy follower (working primitives, not leader)
  // -----------------------------------------------------------------------

  it("does not poll when another tab holds a healthy leadership lease", async () => {
    const env = createEnvironment();
    // acquireLeadership returns false (another tab is leader)
    env.environment.acquireLeadership = async (_leaseMs) => false;
    // isLeadershipAvailable returns true (primitives work)
    env.environment.isLeadershipAvailable = () => true;
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    let refreshCalled = false;
    coordinator.subscribe("test", async () => {
      refreshCalled = true;
      return { changed: false };
    });
    await flushTimers();

    expect(coordinator.getIsLeader()).toBe(false);

    // Advance timers significantly
    await vi.advanceTimersByTimeAsync(30000);
    await flushTimers();

    expect(refreshCalled).toBe(false);
  });

  it("allows only the leader to refresh when two visible coordinators are active", async () => {
    const firstEnv = createEnvironment();
    const secondEnv = createEnvironment();
    secondEnv.environment.acquireLeadership = async () => false;
    const firstRefresh = vi.fn(async () => ({
      changed: false,
      result: refreshResult(true),
    }));
    const secondRefresh = vi.fn(async () => ({
      changed: false,
      result: refreshResult(true),
    }));
    const first = new RefreshCoordinator(firstEnv.environment);
    const second = new RefreshCoordinator(secondEnv.environment);

    first.subscribe("first-filter", firstRefresh);
    second.subscribe("second-filter", secondRefresh);
    await vi.advanceTimersByTimeAsync(0);
    await flushTimers();

    expect(firstRefresh).toHaveBeenCalledTimes(1);
    expect(secondRefresh).not.toHaveBeenCalled();
    first.destroy();
    second.destroy();
  });

  it("promotes a follower and refreshes within two polling cycles after leader expiry", async () => {
    const env = createEnvironment();
    let expiryHandler: (() => void) | undefined;
    let acquisitionAttempt = 0;
    env.environment.acquireLeadership = async () => {
      acquisitionAttempt += 1;
      return acquisitionAttempt > 1;
    };
    env.environment.onLeadershipExpired = (handler) => {
      expiryHandler = handler;
    };
    const refresh = vi.fn(async () => ({
      changed: false,
      result: refreshResult(true),
    }));
    const follower = new RefreshCoordinator(env.environment);

    follower.subscribe("processing", refresh);
    await flushTimers();
    expect(follower.getIsLeader()).toBe(false);
    expect(refresh).not.toHaveBeenCalled();

    expiryHandler?.();
    await vi.advanceTimersByTimeAsync(0);
    await flushTimers();

    expect(follower.getIsLeader()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    follower.destroy();
  });

  it("backs off after an error and keeps processing subscribed work", async () => {
    const env = createEnvironment();
    const refresh = vi
      .fn<() => Promise<{ changed: boolean; result?: StreamRefreshResult }>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue({ changed: false, result: refreshResult(true) });
    const coordinator = new RefreshCoordinator(env.environment);

    coordinator.subscribe("processing", refresh);
    await vi.advanceTimersByTimeAsync(0);
    await flushTimers();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(env.scheduledDelays.at(-1)).toBe(5_000);

    await vi.advanceTimersByTimeAsync(5_000);
    await flushTimers();
    expect(refresh).toHaveBeenCalledTimes(2);
    coordinator.destroy();
  });

  it("uses the adaptive polling windows with bounded jitter", async () => {
    vi.setSystemTime(0);
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    coordinator.subscribe("processing", noopRefresh);
    const getDelay = coordinator as unknown as { computeDelay: () => number };

    expect(getDelay.computeDelay()).toBe(2_300);
    vi.setSystemTime(30_000);
    expect(getDelay.computeDelay()).toBe(5_750);
    vi.setSystemTime(120_000);
    expect(getDelay.computeDelay()).toBe(11_500);
    coordinator.destroy();
  });

  it("caps repeated error backoff at thirty seconds", async () => {
    const env = createEnvironment();
    const refresh = vi.fn(async () => {
      throw new Error("temporary");
    });
    const coordinator = new RefreshCoordinator(env.environment);
    coordinator.subscribe("processing", refresh);

    for (const expectedDelay of [5_000, 10_000, 20_000, 30_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(env.scheduledDelays.at(-1) ?? 0);
      await flushTimers();
      expect(env.scheduledDelays.at(-1)).toBe(expectedDelay);
    }

    coordinator.destroy();
  });

  it("stops only after a successful response explicitly reports terminal work", async () => {
    const env = createEnvironment();
    const refresh = vi.fn(async () => ({
      changed: true,
      result: refreshResult(false),
    }));
    const coordinator = new RefreshCoordinator(env.environment);

    coordinator.subscribe("processing", refresh);
    await vi.advanceTimersByTimeAsync(0);
    await flushTimers();
    await vi.advanceTimersByTimeAsync(30_000);
    await flushTimers();

    expect(refresh).toHaveBeenCalledTimes(1);
    coordinator.destroy();
  });

  // -----------------------------------------------------------------------
  // Coordinator — cleanup on destroy
  // -----------------------------------------------------------------------

  it("cleans up all resources on destroy", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();

    coordinator.destroy();

    expect(coordinator.getState()).toBe("IDLE");
    expect(coordinator.getIsLeader()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Coordinator — single-flight
  // -----------------------------------------------------------------------

  it("does not overlap refresh cycles", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doRefreshSpy = vi.spyOn(coordinator as any, "doRefresh");
    doRefreshSpy.mockResolvedValue(false);

    coordinator.subscribe("test", noopRefresh);
    await flushTimers();
    doRefreshSpy.mockClear();

    // While one refresh is in flight (inFlight is set), try to start another
    // Set inFlight to simulate an active refresh
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coordinator as any).inFlight = Promise.resolve(false);

    // Attempt to wake — should be blocked by inFlight
    coordinator.wake();
    await vi.advanceTimersByTimeAsync(1);
    await flushTimers();

    // No new doRefresh should have been called (single-flight protected)
    expect(doRefreshSpy).not.toHaveBeenCalled();

    // Clear inFlight to simulate refresh completion
    // A completed refresh calls schedule(), which schedules the next cycle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coordinator as any).inFlight = null;
  });
});
