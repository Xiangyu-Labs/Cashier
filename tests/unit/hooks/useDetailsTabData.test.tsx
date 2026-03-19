import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDetailsTabData } from "@/modules/ledger/hooks/useDetailsTabData";
import type { Ledger } from "@/types/api";
import type { SerializedLedgerEntry } from "@/lib/serialization";

vi.mock("@/modules/ledger/actions", () => ({
  getLedgerEntriesAction: vi.fn(),
  getLedgerStatsAction: vi.fn(),
}));

import { getLedgerEntriesAction } from "@/modules/ledger/actions";
import { getLedgerStatsAction } from "@/modules/ledger/actions";

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createLedgerEntry(id: string): SerializedLedgerEntry {
  return {
    id,
    ledgerId: "ledger-1",
    sourceDocumentId: "doc-1",
    categoryId: null,
    itemName: "Lunch",
    amount: "12.00",
    currency: "CNY",
    description: null,
    convertedAmount: "12.00",
    exchangeRate: "1",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
    deletedAt: null,
    category: null,
    sourceDocument: {
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "Doc 1",
      text: null,
      type: "ai_parsed",
      status: "completed",
      entryDate: "2026-03-18",
      createdAt: "2026-03-18T10:00:00.000Z",
      updatedAt: "2026-03-18T10:00:00.000Z",
      deletedAt: null,
      imageUrls: [],
      hasImages: false,
      metadata: {},
      anomalyReason: null,
    },
  };
}

const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-18T00:00:00.000Z",
  deletedAt: null,
  metadata: {
    settings: {
      mainCurrency: "CNY",
      currencies: ["CNY"],
    },
  },
};

describe("useDetailsTabData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLedgerEntriesAction).mockResolvedValue({
      items: [createLedgerEntry("entry-1")],
      nextCursor: undefined,
    });
    vi.mocked(getLedgerStatsAction).mockResolvedValue({
      convertedTotal: { total: 12, currency: "CNY" },
      totals: [{ currency: "CNY", total: 12, count: 1 }],
      trend: [{ date: "2026-03-18", total: 12 }],
      byCategory: [],
    });
  });

  it("changes query identity when advanced filters change", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    const { rerender } = renderHook(
      ({ currency }: { currency: string | null }) =>
        useDetailsTabData({
          ledgerId: "ledger-1",
          ledger,
          periodParams: { period: "custom", startDate: "2026-03-01", endDate: "2026-03-31" },
          advancedFilters: { currency },
        }),
      { initialProps: { currency: "CNY" }, wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(getLedgerEntriesAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getLedgerStatsAction).toHaveBeenCalledTimes(1));

    rerender({ currency: "USD" });

    await waitFor(() => expect(getLedgerEntriesAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getLedgerStatsAction).toHaveBeenCalledTimes(2));

    expect(vi.mocked(getLedgerEntriesAction).mock.calls[1][1]).toMatchObject({ currency: "USD" });
    expect(vi.mocked(getLedgerStatsAction).mock.calls[1][4]).toMatchObject({ currency: "USD" });
  });

  it("reuses fresh cached data on remount without forcing a refetch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: Infinity },
      },
    });

    const wrapper = createWrapper(queryClient);
    const props = {
      ledgerId: "ledger-1",
      ledger,
      periodParams: { period: "custom" as const, startDate: "2026-03-01", endDate: "2026-03-31" },
      advancedFilters: {},
    };

    const first = renderHook(() => useDetailsTabData(props), { wrapper });
    await waitFor(() => expect(getLedgerEntriesAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getLedgerStatsAction).toHaveBeenCalledTimes(1));

    first.unmount();

    renderHook(() => useDetailsTabData(props), { wrapper });

    await waitFor(() => expect(getLedgerEntriesAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getLedgerStatsAction).toHaveBeenCalledTimes(1));
  });
});
