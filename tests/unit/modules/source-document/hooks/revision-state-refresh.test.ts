import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVISION_REFRESH_INTERVAL_MS,
  useRevisionStateRefresh,
} from "@/modules/source-document/hooks/revision-state-refresh";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useRevisionStateRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes immediately and then at a fixed three-second interval", async () => {
    const refresh = vi.fn().mockResolvedValue({ changed: false });

    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh }));
    await flushEffects();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS - 1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("allows at most one in-flight refresh", async () => {
    const request = deferred<{ changed: boolean }>();
    const refresh = vi.fn().mockReturnValue(request.promise);

    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh }));
    await flushEffects();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS * 2);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve({ changed: false });
      await request.promise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and refreshes immediately when visible again", async () => {
    const refresh = vi.fn().mockResolvedValue({ changed: false });
    const view = renderHook(() =>
      useRevisionStateRefresh({ enabled: true, pending: true, refresh })
    );
    await flushEffects();

    setVisibility("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS * 2);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flushEffects();
    expect(refresh).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("pauses while offline and refreshes immediately when online again", async () => {
    const refresh = vi.fn().mockResolvedValue({ changed: false });
    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh }));
    await flushEffects();

    setOnline(false);
    act(() => window.dispatchEvent(new Event("offline")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS * 2);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await flushEffects();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when pending becomes false", async () => {
    const refresh = vi.fn().mockResolvedValue({ changed: false });
    const { rerender } = renderHook(
      ({ pending }) => useRevisionStateRefresh({ enabled: true, pending, refresh }),
      { initialProps: { pending: true } }
    );
    await flushEffects();

    rerender({ pending: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS * 2);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("retries on the next fixed interval after an error", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ changed: false });

    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh }));
    await flushEffects();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps separate hook instances independent", async () => {
    const refreshA = vi.fn().mockResolvedValue({ changed: false });
    const refreshB = vi.fn().mockResolvedValue({ changed: false });

    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh: refreshA }));
    renderHook(() => useRevisionStateRefresh({ enabled: true, pending: true, refresh: refreshB }));
    await flushEffects();

    expect(refreshA).toHaveBeenCalledTimes(1);
    expect(refreshB).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVISION_REFRESH_INTERVAL_MS);
    });
    expect(refreshA).toHaveBeenCalledTimes(2);
    expect(refreshB).toHaveBeenCalledTimes(2);
  });
});
