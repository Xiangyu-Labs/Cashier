import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useActiveTabQueryState } from "@/modules/workspace/hooks/useActiveTabQueryState";

describe("active tab refresh", () => {
  it("refreshes active stats queries without tab reports and excludes other tabs and ledgers", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const stats = vi.fn().mockResolvedValue("stats");
    const otherLedger = vi.fn().mockResolvedValue("other");
    const entries = vi.fn().mockResolvedValue("entries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => {
        useQuery({ queryKey: ["ledger", "ledger-1", "enhanced-stats"], queryFn: stats });
        useQuery({ queryKey: ["ledger", "ledger-2", "enhanced-stats"], queryFn: otherLedger });
        useQuery({ queryKey: ["ledger", "ledger-1", "entries"], queryFn: entries });
        return useActiveTabQueryState({ ledgerId: "ledger-1", activeTab: "stats" });
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    await act(() => result.current.refreshActiveTab());
    expect(stats).toHaveBeenCalledTimes(2);
    expect(otherLedger).toHaveBeenCalledTimes(1);
    expect(entries).toHaveBeenCalledTimes(1);
    stats.mockRejectedValueOnce(new Error("unavailable"));
    await act(async () => {
      await expect(result.current.refreshActiveTab()).rejects.toThrow("unavailable");
    });
    expect(queryClient.getQueryData(["ledger", "ledger-1", "enhanced-stats"])).toBe("stats");
  });
});
