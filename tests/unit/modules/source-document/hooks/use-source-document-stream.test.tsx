import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const listStreamPageActionMock = vi.hoisted(() => vi.fn());
const useRevisionStateRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/source-document/actions", () => ({
  listStreamPageAction: listStreamPageActionMock,
}));

vi.mock("@/modules/source-document/hooks/revision-state-refresh", () => ({
  isRefreshableRevisionState: (status: string) => status === "processing",
  useRevisionStateRefresh: useRevisionStateRefreshMock,
}));

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const { useSourceDocumentStream } =
  await import("@/modules/source-document/hooks/useSourceDocumentStream");

function makeItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ledgerId: "ledger-1",
    title: `Doc ${id}`,
    text: null,
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-01",
    metadata: {},
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ...overrides,
  } as const;
}

describe("useSourceDocumentStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listStreamPageActionMock.mockImplementation(
      (_ledgerId: string, params: { cursor?: string; limit?: number }) => {
        if (params.cursor == null) {
          return Promise.resolve({
            items: [
              makeItem("doc-1", { entryDate: "2026-07-15" }),
              makeItem("doc-2", { entryDate: "2026-07-10" }),
            ],
            nextCursor: "next-page-cursor",
            generation: "1",
          });
        }
        return Promise.resolve({
          items: [makeItem("doc-3", { entryDate: "2026-07-05" })],
          nextCursor: null,
          generation: "1",
        });
      }
    );
  });

  it.each([
    ["terminal items", [makeItem("doc-1", { status: "completed" })]],
    ["an empty page", []],
  ])("does not poll for %s", async (_label, items) => {
    listStreamPageActionMock.mockResolvedValue({
      items,
      nextCursor: null,
      generation: "1",
    });

    renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(useRevisionStateRefreshMock).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, pending: false })
      );
    });
  });

  it("disables the refresh scope when enableRefresh is false", async () => {
    renderHook(() => useSourceDocumentStream("ledger-1", { enableRefresh: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(useRevisionStateRefreshMock).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, pending: false })
      );
    });
  });

  it("fetches the first page on mount and returns stream groups", async () => {
    const { result } = renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.streamGroups.length).toBeGreaterThan(0);
    expect(result.current.hasNextPage).toBe(true);
    expect(listStreamPageActionMock).toHaveBeenCalledWith("ledger-1", {
      cursor: undefined,
      limit: 20,
    });
  });

  it("fetches next page using the prior nextCursor", async () => {
    const { result } = renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Fetch next page
    result.current.fetchNextPage();

    await waitFor(() => {
      expect(listStreamPageActionMock).toHaveBeenCalledWith("ledger-1", {
        cursor: "next-page-cursor",
        limit: 20,
      });
    });
  });

  it("flattens pages and deduplicates by ID preserving server order", async () => {
    // Return doc-1 on both pages to test dedup across pages
    listStreamPageActionMock
      .mockResolvedValueOnce({
        items: [
          makeItem("doc-1", { entryDate: "2026-07-15" }),
          makeItem("doc-2", { entryDate: "2026-07-10" }),
        ],
        nextCursor: "cursor-2",
        generation: "1",
      })
      .mockResolvedValueOnce({
        items: [
          makeItem("doc-1", { entryDate: "2026-07-05" }), // Duplicate from first page
          makeItem("doc-3", { entryDate: "2026-07-01" }),
        ],
        nextCursor: null,
        generation: "1",
      });

    const { result } = renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.fetchNextPage();

    // Wait for second page to load
    await waitFor(() => {
      expect(result.current.isFetchingNextPage).toBe(false);
    });

    // doc-1 appears on both pages; first occurrence (page 1) wins,
    // leaving doc-1, doc-2, doc-3 in server order
    const allIds = result.current.streamGroups.flatMap((g) =>
      g.items.map((i) => i.sourceDocument.id)
    );
    expect(allIds).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(allIds.filter((id) => id === "doc-1")).toHaveLength(1);
  });

  it("reports hasNextPage false after last page", async () => {
    listStreamPageActionMock.mockResolvedValue({
      items: [makeItem("doc-1")],
      nextCursor: null,
      generation: "1",
    });

    const { result } = renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it("passes date filter options to the server action", async () => {
    const startDate = "2026-07-01";
    const endDate = "2026-07-31";

    renderHook(
      () =>
        useSourceDocumentStream("ledger-1", {
          dateRange: { start: startDate, end: endDate },
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(listStreamPageActionMock).toHaveBeenCalledWith("ledger-1", {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        cursor: undefined,
        limit: 20,
      });
    });
  });

  it("passes amount filter options to the server action", async () => {
    renderHook(
      () =>
        useSourceDocumentStream("ledger-1", {
          minAmount: 10,
          maxAmount: 100,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(listStreamPageActionMock).toHaveBeenCalledWith("ledger-1", {
        minAmount: 10,
        maxAmount: 100,
        cursor: undefined,
        limit: 20,
      });
    });
  });

  it("passes status filter options to the server action", async () => {
    renderHook(
      () =>
        useSourceDocumentStream("ledger-1", {
          statuses: ["processing", "failed"],
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(listStreamPageActionMock).toHaveBeenCalledWith("ledger-1", {
        statuses: ["failed", "processing"], // Hook normalizes (sorts) for stable cache keys
        cursor: undefined,
        limit: 20,
      });
    });
  });

  it("resets the exact stream query once for a generation mismatch", async () => {
    listStreamPageActionMock
      .mockResolvedValueOnce({
        items: [
          makeItem("doc-1", { entryDate: "2026-07-15" }),
          makeItem("doc-2", { entryDate: "2026-07-10" }),
        ],
        nextCursor: "cursor-2",
        generation: "1",
      })
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        generation: "2",
        restartRequired: true,
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const reset = vi.spyOn(queryClient, "resetQueries").mockResolvedValue();

    const { result } = renderHook(() => useSourceDocumentStream("ledger-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.fetchNextPage();
    await waitFor(() => {
      expect(reset).toHaveBeenCalledTimes(1);
    });

    expect(reset).toHaveBeenCalledWith({
      queryKey: result.current.queryKey,
      exact: true,
    });
    await act(async () => Promise.resolve());
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the filtered page projection directly from the server page", async () => {
    const entryLatte = {
      id: "entry-latte",
      ledgerId: "ledger-1",
      categoryId: null,
      sourceDocumentId: "doc-1",
      amount: "20.00",
      currency: "USD",
      itemName: "Latte",
      description: null,
      convertedAmount: "20.00",
      exchangeRate: "1.000000",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z",
      deletedAt: null,
      category: null,
    };
    listStreamPageActionMock.mockResolvedValue({
      items: [
        makeItem("doc-1", {
          title: "Server page title",
          updatedAt: "2026-07-01T10:00:00.000Z",
          ledgerEntries: [entryLatte],
        }),
      ],
      nextCursor: null,
      generation: "1",
    });

    const { result } = renderHook(() => useSourceDocumentStream("ledger-1", { search: "latte" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const rendered = result.current.streamGroups[0]?.items[0];
    expect(rendered?.sourceDocument.title).toBe("Server page title");
    expect(rendered?.ledgerEntries.map((entry) => entry.id)).toEqual(["entry-latte"]);
  });
});
