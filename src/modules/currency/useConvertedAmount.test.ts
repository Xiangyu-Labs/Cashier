import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConvertedAmount } from "./useConvertedAmount";

const mockConvertCurrencyAction = vi.hoisted(() => vi.fn(async () => ({ converted: 42 })));

vi.mock("./actions", () => ({
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
  beforeEach(() => {
    mockConvertCurrencyAction.mockClear();
  });

  it("delegates conversion requests through currency actions", async () => {
    const { result } = renderHook(
      () => useConvertedAmount(100, "CNY", "USD", "2026-02-04"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockConvertCurrencyAction).toHaveBeenCalledTimes(1);
    expect(mockConvertCurrencyAction).toHaveBeenCalledWith(100, "CNY", "USD", "2026-02-04");
    expect(result.current.converted).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("returns amount directly when conversion input is missing", () => {
    const { result } = renderHook(() => useConvertedAmount(88, null, "USD"), {
      wrapper: createWrapper(),
    });

    expect(result.current.converted).toBe(88);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockConvertCurrencyAction).not.toHaveBeenCalled();
  });
});
