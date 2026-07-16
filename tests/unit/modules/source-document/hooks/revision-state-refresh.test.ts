import { describe, expect, it, vi } from "vitest";
import {
  REVISION_STATE_REFRESH_INTERVAL_MS,
  RevisionStateRefreshCoordinator,
  isRefreshableRevisionState,
  type RevisionStateRefreshEnvironment,
} from "@/modules/source-document/hooks/revision-state-refresh";

function createEnvironment() {
  let online = true;
  let visible = true;
  const windowListeners = new Map<string, Set<() => void>>();
  const visibilityListeners = new Set<() => void>();

  const environment: RevisionStateRefreshEnvironment = {
    addWindowListener: (type, listener) => {
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeWindowListener: (type, listener) => windowListeners.get(type)?.delete(listener),
    addVisibilityListener: (listener) => visibilityListeners.add(listener),
    removeVisibilityListener: (listener) => visibilityListeners.delete(listener),
    isVisible: () => visible,
    isOnline: () => online,
    setTimer: (listener, delay) => setTimeout(listener, delay),
    clearTimer: (timer) => clearTimeout(timer),
    queueTask: (listener) => queueMicrotask(listener),
  };

  return {
    environment,
    setOnline(value: boolean) {
      online = value;
      for (const listener of windowListeners.get(value ? "online" : "offline") ?? []) listener();
    },
    focus() {
      for (const listener of windowListeners.get("focus") ?? []) listener();
    },
    show() {
      visible = true;
      for (const listener of visibilityListeners) listener();
    },
    listenerCount() {
      return (
        [...windowListeners.values()].reduce((count, listeners) => count + listeners.size, 0) +
        visibilityListeners.size
      );
    },
  };
}

async function flushWakeRefresh() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("revision state refresh", () => {
  it.each(["queued", "processing"] as const)("refreshes %s revisions", (status) => {
    expect(isRefreshableRevisionState(status)).toBe(true);
  });

  it.each(["completed", "anomaly", "failed", "deleted"] as const)(
    "stops after the %s state",
    (status) => {
      expect(isRefreshableRevisionState(status)).toBe(false);
    }
  );

  it("shares one timer and global listener set while deduplicating the same scope", async () => {
    vi.useFakeTimers();
    const testEnvironment = createEnvironment();
    const coordinator = new RevisionStateRefreshCoordinator(testEnvironment.environment);
    const collectionRefresh = vi.fn().mockResolvedValue(undefined);
    const duplicateCollectionRefresh = vi.fn().mockResolvedValue(undefined);
    const detailRefresh = vi.fn().mockResolvedValue(undefined);

    const unsubscribers = [
      coordinator.subscribe("collection", collectionRefresh),
      coordinator.subscribe("collection", duplicateCollectionRefresh),
      coordinator.subscribe("detail", detailRefresh),
    ];

    expect(testEnvironment.listenerCount()).toBe(4);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(REVISION_STATE_REFRESH_INTERVAL_MS);
    expect(collectionRefresh).toHaveBeenCalledTimes(1);
    expect(duplicateCollectionRefresh).not.toHaveBeenCalled();
    expect(detailRefresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    unsubscribers.forEach((unsubscribe) => unsubscribe());
    expect(testEnvironment.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("pauses offline and performs one immediate refresh after reconnect", async () => {
    vi.useFakeTimers();
    const testEnvironment = createEnvironment();
    const coordinator = new RevisionStateRefreshCoordinator(testEnvironment.environment);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = coordinator.subscribe("collection", refresh);

    testEnvironment.setOnline(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(REVISION_STATE_REFRESH_INTERVAL_MS * 2);
    expect(refresh).not.toHaveBeenCalled();

    testEnvironment.setOnline(true);
    await flushWakeRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    unsubscribe();
    vi.useRealTimers();
  });

  it("coalesces focus and visibility recovery and stops after the final subscriber leaves", async () => {
    vi.useFakeTimers();
    const testEnvironment = createEnvironment();
    const coordinator = new RevisionStateRefreshCoordinator(testEnvironment.environment);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = coordinator.subscribe("detail", refresh);

    testEnvironment.focus();
    testEnvironment.show();
    await flushWakeRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(REVISION_STATE_REFRESH_INTERVAL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(testEnvironment.listenerCount()).toBe(0);
    vi.useRealTimers();
  });
});
