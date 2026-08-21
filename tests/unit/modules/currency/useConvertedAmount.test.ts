import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConvertedAmount } from "@/modules/currency/hooks/useConvertedAmount";

const mockConvertCurrencyAction = vi.hoisted(() => vi.fn(async () => ({ converted: 42 })));

vi.mock("@/modules/currency/actions", () => ({
  convertCurrencyAction: mockConvertCurrencyAction,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

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
      () => useConvertedAmount(ledgerId, 100, "CNY", "USD", "2026-02-04"),
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
    expect(result.current).toEqual({ status: "success", converted: 42 });
  });

  it("returns amount directly when conversion input is missing", () => {
    const { result } = renderHook(() => useConvertedAmount(ledgerId, 88, null, "USD"), {
      wrapper: createWrapper(),
    });

    expect(result.current).toEqual({ status: "idle", converted: 88 });
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });

  it("does not run a query when disabled (persisted value is authoritative)", async () => {
    const { result } = renderHook(
      () =>
        useConvertedAmount(ledgerId, 100, "CNY", "USD", "2026-02-04", {
          enabled: false,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toEqual({ status: "idle", converted: 100 });
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });

  it("reports loading and error states from the query", async () => {
    mockConvertCurrencyAction.mockRejectedValueOnce(new Error("rates unavailable"));
    const { result } = renderHook(
      () => useConvertedAmount(ledgerId, 100, "CNY", "USD", "2026-02-04"),
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
});
