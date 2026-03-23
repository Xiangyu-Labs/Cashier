import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

const { getSourceDocumentCollectionActionMock, useQueryMock } = vi.hoisted(() => ({
  getSourceDocumentCollectionActionMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentCollectionAction: getSourceDocumentCollectionActionMock,
}));

import { useSourceDocumentCollection } from "@/modules/source-document/hooks/useSourceDocumentCollection";

const completedDoc = {
  id: "doc-1",
  status: "completed",
  ledgerEntries: [
    {
      id: "entry-1",
      amount: "10.00",
      convertedAmount: "10.00",
    },
  ],
} as never;

describe("useSourceDocumentCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((options: Record<string, unknown>) => ({
      data: { items: [completedDoc] },
      isLoading: false,
      ...options,
    }));
    getSourceDocumentCollectionActionMock.mockResolvedValue({
      items: [completedDoc],
      hasMore: false,
      total: 1,
    });
  });

  it("includes amount filters in the query key and server action payload", async () => {
    renderHook(() =>
      useSourceDocumentCollection("ledger-1", {
        dateRange: {
          start: new Date("2026-03-01T00:00:00.000Z"),
          end: new Date("2026-03-31T00:00:00.000Z"),
        },
        minAmount: 20,
        maxAmount: 100,
      })
    );

    const queryOptions = useQueryMock.mock.calls[0]?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };

    expect(queryOptions.queryKey).toEqual(
      queryKeys.sourceDocumentCollection("ledger-1", {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        minAmount: 20,
        maxAmount: 100,
        limit: 1000,
      })
    );

    await queryOptions.queryFn();

    expect(getSourceDocumentCollectionActionMock).toHaveBeenCalledWith("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      minAmount: 20,
      maxAmount: 100,
      limit: 1000,
    });
  });

  it("does not apply client-side amount filtering after data is returned", () => {
    const { result } = renderHook(() =>
      useSourceDocumentCollection("ledger-1", {
        minAmount: 100,
      })
    );

    expect(result.current.groups.completed).toHaveLength(1);
    expect(result.current.rawData).toHaveLength(1);
  });

  it("polls only while queued or processing documents exist", () => {
    renderHook(() => useSourceDocumentCollection("ledger-1"));

    const queryOptions = useQueryMock.mock.calls[0]?.[0] as {
      refetchInterval: (query: {
        state: { data: { items: Array<{ status: string }> } | undefined };
      }) => number | false;
    };

    expect(
      queryOptions.refetchInterval({
        state: { data: { items: [{ status: "queued" }] } },
      })
    ).toBe(3000);
    expect(
      queryOptions.refetchInterval({
        state: { data: { items: [{ status: "completed" }] } },
      })
    ).toBe(false);
  });
});
