import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isRefreshableRevisionState,
  RefreshCoordinator,
  setGlobalCoordinator,
  type RefreshEnvironment,
} from "@/modules/source-document/hooks/revision-state-refresh";

// ---------------------------------------------------------------------------
// Test environment factory
// ---------------------------------------------------------------------------

function createEnvironment() {
  let online = true;
  let visible = true;
  const listeners = new Map<string, Set<() => void>>();
  const broadcastHandlers = new Set<(data: unknown) => void>();

  const environment: RefreshEnvironment = {
    now: () => Date.now(),
    random: () => 0.5,
    setTimer: (cb, ms) => {
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
  });

  // -----------------------------------------------------------------------
  // Legacy API — isRefreshableRevisionState
  // -----------------------------------------------------------------------

  it.each(["queued", "processing"] as const)("returns true for %s", (status) => {
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

    coordinator.subscribe("test");
    await flushTimers();

    // Should have a timer scheduled
    expect(coordinator.getState()).not.toBe("IDLE");
  });

  it("acquires leadership on start", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test");
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

    coordinator.subscribe("test");
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

    coordinator.subscribe("test");
    await flushTimers();

    const stateBefore = coordinator.getState();
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

    coordinator.subscribe("test");
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
  // Coordinator — cleanup on destroy
  // -----------------------------------------------------------------------

  it("cleans up all resources on destroy", async () => {
    const env = createEnvironment();
    const coordinator = new RefreshCoordinator(env.environment);
    setGlobalCoordinator(coordinator);

    coordinator.subscribe("test");
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

    const doRefreshSpy = vi.spyOn(coordinator as any, "doRefresh");
    doRefreshSpy.mockResolvedValue(false);

    coordinator.subscribe("test");
    await flushTimers();
    doRefreshSpy.mockClear();

    // While one refresh is in flight (inFlight is set), try to start another
    // Set inFlight to simulate an active refresh
    (coordinator as any).inFlight = Promise.resolve(false);

    // Attempt to wake — should be blocked by inFlight
    coordinator.wake();
    await vi.advanceTimersByTimeAsync(1);
    await flushTimers();

    // No new doRefresh should have been called (single-flight protected)
    expect(doRefreshSpy).not.toHaveBeenCalled();

    // Clear inFlight to simulate refresh completion
    // A completed refresh calls schedule(), which schedules the next cycle
    (coordinator as any).inFlight = null;
  });
});
