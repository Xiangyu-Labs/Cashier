import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUnifiedSourceDocuments } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { getSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";

// Mock API modules
vi.mock("@/features/source-document/server/actions/main", () => ({
    getSourceDocumentsAction: vi.fn(),
}));
vi.mock("@/features/ledger/server/actions/entries", () => ({
    getLedgerEntriesAction: vi.fn(),
}));

// Mock Data
const mockSourceDocs = {
    queued: { id: "doc_q1", status: "queued", createdAt: "2024-01-04T10:00:00Z" },
    processing: { id: "doc_p1", status: "processing", createdAt: "2024-01-04T11:00:00Z" },
    error: { id: "doc_e1", status: "anomaly", createdAt: "2024-01-04T12:00:00Z" },
    pending: { id: "doc_pending1", status: "completed", createdAt: "2024-01-03T10:00:00Z" }, // Completed doc but has pending entries
    completed: { id: "doc_c1", status: "completed", createdAt: "2024-01-01T10:00:00Z" },
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
        // 1. activeDocuments (queued, processing, error)
        (getSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, params: unknown) => {
            const p = params as { status?: string };
            if (p?.status?.includes('queued')) {
                return Promise.resolve({
                    items: [mockSourceDocs.queued, mockSourceDocs.processing, mockSourceDocs.error]
                });
            }
            // infinite scroll fetch
            return Promise.resolve({
                items: [mockSourceDocs.completed, mockSourceDocs.pending],
                nextCursor: null
            });
        });

        // 2. pendingEntries - now returns empty as we don't use it for anomaly detection anymore
        // or effectively empty for the purpose of this test setup
        (getLedgerEntriesAction as unknown as Mock).mockImplementation((_id: string, params: unknown) => {
            // confirmed entries
            return Promise.resolve({
                items: [mockEntries.confirmedForDocCompleted1]
            });
        });

        const { result } = renderHook(() => useUnifiedSourceDocuments("ledger_1"), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const { groups } = result.current;

        // Verify Processing Group (queued + processing)
        expect(groups.processing).toHaveLength(2);
        expect(groups.processing.map(g => g.sourceDocument.status).sort()).toEqual(['processing', 'queued']);

        // Verify Anomaly Group
        // Only doc_e1 has status='anomaly'. 
        // doc_pending1 has status='completed' and no entries -> goes to completed group
        expect(groups.anomaly).toHaveLength(1);
        expect(groups.anomaly[0].sourceDocument.id).toBe("doc_e1");
        expect(groups.anomaly[0].ledgerEntries).toHaveLength(0); // No entries for anomaly

        // Verify Completed Group
        // Should contain doc_c1 and doc_pending1
        expect(groups.completed).toHaveLength(2);
        expect(groups.completed.map(g => g.sourceDocument.id).sort()).toEqual(["doc_c1", "doc_pending1"].sort());

        // Verify stats
        expect(result.current.stats.processingCount).toBe(2);
        expect(result.current.stats.anomalyCount).toBe(1);
    });

    it("filters groups by date range", async () => {
        // All mocks same as above
        (getSourceDocumentsAction as unknown as Mock).mockResolvedValue({ items: [], nextCursor: null });
        (getLedgerEntriesAction as unknown as Mock).mockResolvedValue({ items: [] });

        // Mock specific returns for this test to control dates easier if needed, 
        // but existing mocks have dates:
        // doc_c1: 2024-01-01 (Jan 1)
        // doc_q1: 2024-01-04 (Jan 4)

        // Let's reuse the mocks implementation pattern
        (getSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, params: unknown) => {
            const p = params as { status?: string };
            if (p?.status?.includes('queued')) {
                return Promise.resolve({ items: [mockSourceDocs.queued] });
            }
            return Promise.resolve({ items: [mockSourceDocs.completed] });
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

        // Jan 4 doc should be in processing group (queued status, in date range)
        expect(result.current.groups.processing).toHaveLength(1);

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

        (getSourceDocumentsAction as unknown as Mock).mockImplementation((_id: string, params: unknown) => {
            const p = params as { status?: string };
            if (p?.status?.includes('queued')) {
                return Promise.resolve({ items: [mockSourceDocs.queued, docOutOfRange] });
            }
            return Promise.resolve({ items: [] });
        });

        const { result: result2 } = renderHook(
            () => useUnifiedSourceDocuments("ledger_1", { dateRange }),
            { wrapper }
        );

        await waitFor(() => expect(result2.current.isLoading).toBe(false));

        // Only doc_q1 (Jan 4, in range) should be in processing, doc_out (Jan 1, out of range) filtered out
        expect(result2.current.groups.processing).toHaveLength(1);
        expect(result2.current.groups.processing[0].sourceDocument.id).toBe("doc_q1");
    });
});
