import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConvertedAmount } from "@/modules/currency/hooks/useConvertedAmount";

const mockConvertCurrencyAction = vi.hoisted(() => vi.fn(async () => ({ converted: "42" })));

vi.mock("@/modules/currency/server-actions/convert-currency", () => ({
  convertCurrencyAction: mockConvertCurrencyAction,
}));

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useConvertedAmount", () => {
  const ledgerId = "10000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    mockConvertCurrencyAction.mockClear();
  });

  it("delegates conversion requests through currency actions", async () => {
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, "100", "CNY", "USD", "2026-02-04"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(mockConvertCurrencyAction).toHaveBeenCalledTimes(1);
    expect(mockConvertCurrencyAction).toHaveBeenCalledWith(
      ledgerId,
      "100",
      "CNY",
      "USD",
      "2026-02-04"
    );
    expect(result.current).toEqual({ status: "success", converted: "42" });
  });

  it("returns amount directly when conversion input is missing", () => {
    const { result } = renderHook(() => useConvertedAmount(ledgerId, "88", null, "USD"), {
      wrapper: createWrapper(),
    });

    expect(result.current).toEqual({ status: "idle", converted: "88" });
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });

  it("does not run a query when disabled (persisted value is authoritative)", async () => {
    const { result } = renderHook(
      () =>
        useConvertedAmount(ledgerId, "100", "CNY", "USD", "2026-02-04", {
          enabled: false,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toEqual({ status: "idle", converted: "100" });
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });

  it("reports loading and error states from the query", async () => {
    mockConvertCurrencyAction.mockRejectedValueOnce(new Error("rates unavailable"));
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, "100", "CNY", "USD", "2026-02-04"),
      { wrapper: createWrapper() }
    );

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current).toMatchObject({
      status: "error",
      converted: null,
      error: expect.any(Error),
    });
  });

  it("isolates cached conversions by ledger", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ currentLedgerId }) =>
        useConvertedAmount(currentLedgerId, "100", "CNY", "USD", "2026-02-04"),
      {
        initialProps: { currentLedgerId: "ledger-a" },
        wrapper: createWrapper(queryClient),
      }
    );
    await waitFor(() => expect(result.current.status).toBe("success"));

    rerender({ currentLedgerId: "ledger-b" });
    await waitFor(() => expect(mockConvertCurrencyAction).toHaveBeenCalledTimes(2));
    expect(mockConvertCurrencyAction).toHaveBeenNthCalledWith(
      1,
      "ledger-a",
      "100",
      "CNY",
      "USD",
      "2026-02-04"
    );
    expect(mockConvertCurrencyAction).toHaveBeenNthCalledWith(
      2,
      "ledger-b",
      "100",
      "CNY",
      "USD",
      "2026-02-04"
    );
  });

  it("uses the same concrete default date for the query and action", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 1, 4, 23, 30));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { result } = renderHook(() => useConvertedAmount(ledgerId, "100", "CNY", "USD"), {
        wrapper: createWrapper(queryClient),
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(mockConvertCurrencyAction).toHaveBeenCalledWith(
        ledgerId,
        "100",
        "CNY",
        "USD",
        "2026-02-04"
      );
      expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual([
        "ledger",
        ledgerId,
        "convert",
        "100",
        "CNY",
        "USD",
        "2026-02-04",
      ]);
      expect(result.current.status).not.toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalizes timestamps to the client's local civil date", async () => {
    const timestamp = "2026-02-04T23:30:00.000Z";
    const parsed = new Date(timestamp);
    const expected = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    renderHook(() => useConvertedAmount(ledgerId, "100", "CNY", "USD", timestamp), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockConvertCurrencyAction).toHaveBeenCalled());
    expect(mockConvertCurrencyAction).toHaveBeenCalledWith(ledgerId, "100", "CNY", "USD", expected);
  });

  it.each(["bad", "12oops", "Infinity"])("rejects invalid action result %s", async (converted) => {
    mockConvertCurrencyAction.mockResolvedValueOnce({ converted });
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, "100", "CNY", "USD", "2026-02-04"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({
      status: "error",
      error: expect.objectContaining({ message: "Invalid currency conversion result" }),
    });
  });

  it("keeps a large decimal string intact", async () => {
    mockConvertCurrencyAction.mockResolvedValueOnce({ converted: "9007199254740993.12" });
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, "9007199254740993.12", "CNY", "USD", "2026-02-04"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(mockConvertCurrencyAction).toHaveBeenCalledWith(
      ledgerId,
      "9007199254740993.12",
      "CNY",
      "USD",
      "2026-02-04"
    );
    expect(result.current.converted).toBe("9007199254740993.12");
  });

  it("stays idle for invalid dates", () => {
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, "100", "CNY", "USD", "not-a-date"),
      { wrapper: createWrapper() }
    );

    expect(result.current).toEqual({ status: "idle", converted: "100" });
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });
});
