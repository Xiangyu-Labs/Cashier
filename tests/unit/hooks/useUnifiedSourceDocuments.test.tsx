import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUnifiedSourceDocuments } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";

// Mock API modules
vi.mock("@/features/source-document/server/actions/main", () => ({
    getUnifiedSourceDocumentsAction: vi.fn(),
    getSourceDocumentsAction: vi.fn(), // Keeping for potential other uses
}));
vi.mock("@/features/ledger/server/actions/entries", () => ({
    getLedgerEntriesAction: vi.fn(),
}));

// Mock Data
const mockSourceDocs = {
    queued: { id: "doc_q1", status: "queued", createdAt: "2024-01-04T10:00:00Z", deletedAt: null },
    processing: { id: "doc_p1", status: "processing", createdAt: "2024-01-04T11:00:00Z", deletedAt: null },
    error: { id: "doc_e1", status: "anomaly", createdAt: "2024-01-04T12:00:00Z", deletedAt: null },
    pending: { id: "doc_pending1", status: "completed", createdAt: "2024-01-03T10:00:00Z", deletedAt: null }, // Completed doc but has pending entries
    completed: { id: "doc_c1", status: "completed", createdAt: "2024-01-01T10:00:00Z", deletedAt: null },
};

const mockEntries = {
    // These concepts of "pending entries" are largely legacy now, 
    // as anomalies are tracked on the document, not individual entries.
    // However, keeping structure for compatibility with hook Logic if it still fetches them.
    // But since anomaly docs have no entries, we should test appropriate scenarios.

    // For doc_p1 (processing) - empty entries usually until complete? Or maybe partial?
    // Let's assume confirming docs have entries.
    confirmedForDocCompleted1: {
        id: "entry_3",
        sourceDocumentId: "doc_c1",
        sourceDocument: mockSourceDocs.completed
    }
};

describe("useUnifiedSourceDocuments", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        vi.clearAllMocks();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient} > {children} </QueryClientProvider>
    );

    it("correctly groups documents into processing, error, and completed", async () => {
        // Setup Mocks
        // 1. Unified Action Mock
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, _params: unknown) => {
            const p = _params as { status?: string, cursor?: string };

            // If it's an infinite scroll fetch (cursor provided)
            if (p?.cursor) {
                return Promise.resolve({
                    groups: {
                        processing: [],
                        anomaly: [],
                        completed: [
                            { sourceDocument: { ...mockSourceDocs.completed, id: "doc_c2" }, ledgerEntries: [] }
                        ]
                    },
                    nextCursor: null,
                    stats: { processingCount: 0, anomalyCount: 0 }
                });
            }

            // Normal initial fetch
            return Promise.resolve({
                groups: {
                    queued: [
                        { sourceDocument: mockSourceDocs.queued, ledgerEntries: [] }
                    ],
                    processing: [
                        { sourceDocument: mockSourceDocs.processing, ledgerEntries: [] }
                    ],
                    anomaly: [
                        { sourceDocument: mockSourceDocs.error, ledgerEntries: [] }
                    ],
                    completed: [
                        { sourceDocument: mockSourceDocs.completed, ledgerEntries: [mockEntries.confirmedForDocCompleted1] },
                        { sourceDocument: mockSourceDocs.pending, ledgerEntries: [] }
                    ]
                },
                nextCursor: null,
                stats: {
                    queuedCount: 1,
                    processingCount: 1,
                    anomalyCount: 1
                }
            });
        });

        // 2. No separate ledger entries fetch anymore


        const { result } = renderHook(() => useUnifiedSourceDocuments("ledger_1"), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const { groups } = result.current;

        // Verify Queued Group
        expect(groups.queued).toHaveLength(1);
        expect(groups.queued[0].sourceDocument.status).toBe('queued');

        // Verify Processing Group
        expect(groups.processing).toHaveLength(1);
        expect(groups.processing[0].sourceDocument.status).toBe('processing');

        // Verify Anomaly Group
        expect(groups.anomaly).toHaveLength(1);
        expect(groups.anomaly[0].sourceDocument.id).toBe("doc_e1");
        expect(groups.anomaly[0].ledgerEntries).toHaveLength(0);

        // Verify Completed Group
        expect(groups.completed).toHaveLength(2);
        expect(groups.completed.map(g => g.sourceDocument.id).sort()).toEqual(["doc_c1", "doc_pending1"].sort());

        // Verify stats
        expect(result.current.stats.queuedCount).toBe(1);
        expect(result.current.stats.processingCount).toBe(1);
        expect(result.current.stats.anomalyCount).toBe(1);
    });

    it("filters groups by date range", async () => {
        // All mocks same as above
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockResolvedValue({
            groups: { processing: [], anomaly: [], completed: [] },
            nextCursor: null,
            stats: { processingCount: 0, anomalyCount: 0 }
        });
        (getLedgerEntriesAction as unknown as Mock).mockResolvedValue({ items: [] });

        // Mock specific returns for this test to control dates easier if needed, 
        // but existing mocks have dates:
        // doc_c1: 2024-01-01 (Jan 1)
        // doc_q1: 2024-01-04 (Jan 4)

        // Let's reuse the mocks implementation pattern
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, _params: unknown) => {
            const _p = _params as { status?: string };
            return Promise.resolve({
                groups: {
                    queued: [{ sourceDocument: mockSourceDocs.queued, ledgerEntries: [] }],
                    processing: [],
                    anomaly: [],
                    completed: [{ sourceDocument: mockSourceDocs.completed, ledgerEntries: [] }]
                },
                nextCursor: null,
                stats: { queuedCount: 1, processingCount: 0, anomalyCount: 0 }
            });
        });

        const dateRange = {
            start: new Date("2024-01-03T00:00:00Z"),
            end: new Date("2024-01-05T00:00:00Z")
        };

        const { result } = renderHook(
            () => useUnifiedSourceDocuments("ledger_1", { dateRange }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Jan 4 doc should be in queued group (queued status, in date range)
        expect(result.current.groups.queued).toHaveLength(1);

        // Jan 1 doc should be filtered out
        // Note: completed group logic in hook takes `grouped.completed` which comes from `completedData`
        // The hook applies `isDateInRange` to processing, pending, error groups.
        // For completed group, it is usually filtered by API query param, but the hook `filtersGroups` memo
        // explicitly says `completed: grouped.completed` without filtering logic in the memo?
        // Let's re-read the hook code...
        // Ah, in the hook: 
        // `queryFn: ... fetchSourceDocuments(..., { startDate, endDate })`
        // So completed docs are filtered by API.
        // But processing/pending/error are fetched via active/pending queries which DO NOT pass date params to API (in the hook).
        // So for these, the client-side `filteredGroups` logic applies.

        // Wait, looking at useUnifiedSourceDocuments.ts:
        // const filterGroup = (groups) => groups.filter(...)
        // return { processing: filterGroup(...), ..., completed: grouped.completed }
        // Correct, completed is assumed filtered by API.

        // So in this test, since we mock API to return doc_c1 even if date params are passed (unless we add logic to mock),
        // we might see doc_c1 if we don't mock the API side filtering.
        // But wait, the hook passes date range to useInfiniteQuery.
        // The test doesn't check if useInfiniteQuery passed those params to `fetchSourceDocuments`.

        // Let's verify client-side filtering logic for processing/error groups.
        // doc_q1 is Jan 4 (in range).

        // Let's assume doc_out_range
        const docOutOfRange = { ...mockSourceDocs.queued, id: "doc_out", createdAt: "2024-01-01T10:00:00Z" };

        (getUnifiedSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, _params: unknown) => {
            return Promise.resolve({
                groups: {
                    queued: [
                        { sourceDocument: mockSourceDocs.queued, ledgerEntries: [] },
                        { sourceDocument: docOutOfRange, ledgerEntries: [] }
                    ],
                    processing: [],
                    anomaly: [],
                    completed: []
                },
                nextCursor: null,
                stats: { queuedCount: 2, processingCount: 0, anomalyCount: 0 }
            });
        });

        const { result: result2 } = renderHook(
            () => useUnifiedSourceDocuments("ledger_1", { dateRange }),
            { wrapper }
        );

        await waitFor(() => expect(result2.current.isLoading).toBe(false));

        // Only doc_q1 (Jan 4, in range) should be in queued, doc_out (Jan 1, out of range) filtered out
        expect(result2.current.groups.queued).toHaveLength(1);
        expect(result2.current.groups.queued[0].sourceDocument.id).toBe("doc_q1");
    });

    it("filters by minAmount and maxAmount", async () => {
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockResolvedValue({
            groups: {
                queued: [],
                processing: [],
                anomaly: [],
                completed: [
                    { sourceDocument: { ...mockSourceDocs.completed, id: "doc_low", amount: 50 }, ledgerEntries: [] },
                    { sourceDocument: { ...mockSourceDocs.completed, id: "doc_mid", amount: 150 }, ledgerEntries: [] },
                    { sourceDocument: { ...mockSourceDocs.completed, id: "doc_high", amount: 500 }, ledgerEntries: [] }
                ]
            },
            nextCursor: null,
            stats: { processingCount: 0, anomalyCount: 0 }
        });

        const { result } = renderHook(
            () => useUnifiedSourceDocuments("ledger_1", { minAmount: 100, maxAmount: 200 }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Verify that min/max amount params were passed to the API
        expect(getUnifiedSourceDocumentsAction).toHaveBeenCalledWith(
            "ledger_1",
            expect.objectContaining({
                minAmount: 100,
                maxAmount: 200
            })
        );
    });

    it("handles infinite scroll for completed documents", async () => {
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, params: unknown) => {
            const p = params as { cursor?: string };

            if (p?.cursor === "page2") {
                return Promise.resolve({
                    groups: {
                        queued: [],
                        processing: [],
                        anomaly: [],
                        completed: [
                            { sourceDocument: { ...mockSourceDocs.completed, id: "doc_page2_1" }, ledgerEntries: [] },
                            { sourceDocument: { ...mockSourceDocs.completed, id: "doc_page2_2" }, ledgerEntries: [] }
                        ]
                    },
                    nextCursor: null, // No more pages
                    stats: { processingCount: 0, anomalyCount: 0 }
                });
            }

            // First page
            return Promise.resolve({
                groups: {
                    queued: [],
                    processing: [],
                    anomaly: [],
                    completed: [
                        { sourceDocument: { ...mockSourceDocs.completed, id: "doc_page1_1" }, ledgerEntries: [] }
                    ]
                },
                nextCursor: "page2",
                stats: { processingCount: 0, anomalyCount: 0 }
            });
        });

        const { result } = renderHook(() => useUnifiedSourceDocuments("ledger_1"), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // First page should be loaded
        expect(result.current.groups.completed).toHaveLength(1);
        expect(result.current.hasNextPage).toBe(true);

        // Fetch next page
        act(() => {
            result.current.fetchNextPage();
        });

        await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));

        // Should now have both pages
        expect(result.current.groups.completed).toHaveLength(3);
        expect(result.current.hasNextPage).toBe(false);
    });

    it("deduplicates completed documents when cache is invalidated", async () => {
        const doc1 = { sourceDocument: { ...mockSourceDocs.completed, id: "doc_dup" }, ledgerEntries: [] };

        (getUnifiedSourceDocumentsAction as unknown as Mock).mockResolvedValue({
            groups: {
                queued: [],
                processing: [],
                anomaly: [],
                completed: [doc1, doc1] // Duplicate entries
            },
            nextCursor: null,
            stats: { processingCount: 0, anomalyCount: 0 }
        });

        const { result } = renderHook(() => useUnifiedSourceDocuments("ledger_1"), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Should deduplicate - only 1 unique document
        expect(result.current.groups.completed).toHaveLength(1);
        expect(result.current.groups.completed[0].sourceDocument.id).toBe("doc_dup");
    });

    it("uses initial data when provided", async () => {
        const initialActiveDocs = [
            { ...mockSourceDocs.queued, ledgerEntries: [] },
            { ...mockSourceDocs.processing, ledgerEntries: [] }
        ];

        const initialCompletedDocs = [
            { ...mockSourceDocs.completed, ledgerEntries: [mockEntries.confirmedForDocCompleted1] }
        ];

        (getUnifiedSourceDocumentsAction as unknown as Mock).mockImplementation(() => {
            return Promise.resolve({
                groups: {
                    queued: [{ sourceDocument: initialActiveDocs[0], ledgerEntries: [] }],
                    processing: [{ sourceDocument: initialActiveDocs[1], ledgerEntries: [] }],
                    anomaly: [],
                    completed: [{ sourceDocument: initialCompletedDocs[0], ledgerEntries: initialCompletedDocs[0].ledgerEntries }]
                },
                nextCursor: null,
                stats: { queuedCount: 1, processingCount: 1, anomalyCount: 0 }
            });
        });

        const { result } = renderHook(
            () => useUnifiedSourceDocuments("ledger_1", {
                initialActiveSourceDocuments: initialActiveDocs as unknown as SourceDocumentWithEntries[],
                initialCompletedSourceDocuments: initialCompletedDocs as unknown as SourceDocumentWithEntries[]
            }),
            { wrapper }
        );

        // Should use initial data immediately
        expect(result.current.groups.queued).toHaveLength(1);
        expect(result.current.groups.processing).toHaveLength(1);
        expect(result.current.groups.completed).toHaveLength(1);
    });

    it("returns empty groups when no data", async () => {
        (getUnifiedSourceDocumentsAction as unknown as Mock).mockResolvedValue(null);

        const { result } = renderHook(() => useUnifiedSourceDocuments("ledger_1"), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.groups.queued).toHaveLength(0);
        expect(result.current.groups.processing).toHaveLength(0);
        expect(result.current.groups.anomaly).toHaveLength(0);
        expect(result.current.groups.completed).toHaveLength(0);
        expect(result.current.stats.queuedCount).toBe(0);
        expect(result.current.stats.processingCount).toBe(0);
    });
});
