import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLedgerPagePrefetching } from "@/modules/workspace/ui/useLedgerPagePrefetching";

const fireAndForgetMock = vi.hoisted(() => vi.fn());
const getLedgerActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/safe-async", () => ({
  fireAndForget: fireAndForgetMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  getLedgerAction: getLedgerActionMock,
}));

describe("useLedgerPagePrefetching", () => {
  let inputPrefetchCallback: (() => void) | null = null;
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    inputPrefetchCallback = null;
    getLedgerActionMock.mockResolvedValue({ id: "ledger-1" });

    setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      delay?: number
    ) => {
      if (delay === 2000 && typeof callback === "function") {
        inputPrefetchCallback = callback as () => void;
        return 2000 as unknown as ReturnType<typeof setTimeout>;
      }
      return 500 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    clearTimeoutSpy = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation((() => undefined) as typeof clearTimeout);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it("prefetches ledger query when input is closed and cache is empty", () => {
    const queryClient = {
      getQueryData: vi.fn(() => undefined),
      prefetchQuery: vi.fn(() => Promise.resolve()),
    };

    renderHook(() =>
      useLedgerPagePrefetching({
        activeTab: "stream",
        isInputOpen: false,
        ledgerId: "ledger-1",
        queryClient: queryClient as never,
      })
    );

    expect(inputPrefetchCallback).not.toBeNull();
    inputPrefetchCallback?.();

    expect(queryClient.getQueryData).toHaveBeenCalled();
    expect(queryClient.prefetchQuery).toHaveBeenCalledOnce();
    expect(fireAndForgetMock).toHaveBeenCalled();
  });

  it("does not prefetch ledger query when cache exists", () => {
    const queryClient = {
      getQueryData: vi.fn(() => ({ id: "ledger-1" })),
      prefetchQuery: vi.fn(() => Promise.resolve()),
    };

    renderHook(() =>
      useLedgerPagePrefetching({
        activeTab: "stream",
        isInputOpen: false,
        ledgerId: "ledger-1",
        queryClient: queryClient as never,
      })
    );

    inputPrefetchCallback?.();
    expect(queryClient.prefetchQuery).not.toHaveBeenCalled();
  });

  it("schedules preload work with a 500ms timer for non-active tabs", () => {
    const queryClient = {
      getQueryData: vi.fn(() => undefined),
      prefetchQuery: vi.fn(() => Promise.resolve()),
    };

    renderHook(() =>
      useLedgerPagePrefetching({
        activeTab: "details",
        isInputOpen: true,
        ledgerId: "ledger-1",
        queryClient: queryClient as never,
      })
    );

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it("clears scheduled timers on unmount", () => {
    const queryClient = {
      getQueryData: vi.fn(() => undefined),
      prefetchQuery: vi.fn(() => Promise.resolve()),
    };

    const { unmount } = renderHook(() =>
      useLedgerPagePrefetching({
        activeTab: "stream",
        isInputOpen: false,
        ledgerId: "ledger-1",
        queryClient: queryClient as never,
      })
    );

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
