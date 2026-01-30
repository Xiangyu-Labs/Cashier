import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUnifiedSourceDocuments } from "@/hooks/useUnifiedSourceDocuments";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { fetchSourceDocuments, fetchLedgerEntries } from "@/lib/api";

// Mock API modules
vi.mock("@/lib/api", () => ({
    fetchSourceDocuments: vi.fn(),
    fetchLedgerEntries: vi.fn(),
}));

// Mock Data
const mockSourceDocs = {
    queued: { id: "doc_q1", status: "queued", createdAt: "2024-01-04T10:00:00Z" },
    processing: { id: "doc_p1", status: "processing", createdAt: "2024-01-04T11:00:00Z" },
    error: { id: "doc_e1", status: "error", createdAt: "2024-01-04T12:00:00Z" },
    pending: { id: "doc_pending1", status: "completed", createdAt: "2024-01-03T10:00:00Z" }, // Completed doc but has pending entries
    completed: { id: "doc_c1", status: "completed", createdAt: "2024-01-01T10:00:00Z" },
};

const mockEntries = {
    pendingForDocPending1: {
        id: "entry_1",
        sourceDocumentId: "doc_pending1",
        status: "pending",
        sourceDocument: mockSourceDocs.pending
    },
    pendingForDocError1: {
        id: "entry_2",
        sourceDocumentId: "doc_e1",
        status: "pending",
        sourceDocument: mockSourceDocs.error
    },
    confirmedForDocCompleted1: {
        id: "entry_3",
        sourceDocumentId: "doc_c1",
        status: "confirmed",
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
        <QueryClientProvider client= { queryClient } > { children } </QueryClientProvider>
    );

it("correctly groups documents into processing, error, pending, and completed", async () => {
    // Setup Mocks
    // 1. activeDocuments (queued, processing, error)
    (fetchSourceDocuments as any).mockImplementation((_id: string, params: any) => {
        if (params?.status?.includes('queued')) {
            return Promise.resolve({
                items: [mockSourceDocs.queued, mockSourceDocs.processing, mockSourceDocs.error]
            });
        }
        // infinite scroll fetch
        return Promise.resolve({
            items: [mockSourceDocs.completed, mockSourceDocs.pending], // Infinite scroll returns everything usually, but here we simulate the rest
            nextCursor: null
        });
    });

    // 2. pendingEntries
    (fetchLedgerEntries as any).mockImplementation((_id: string, params: any) => {
        if (params?.status === 'pending') {
            return Promise.resolve({
                items: [mockEntries.pendingForDocPending1, mockEntries.pendingForDocError1]
            });
        }
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
    expect(groups.processing.map(g => g.sourceDocument.id).sort()).toEqual(["doc_p1", "doc_q1"].sort());

    // Verify Error Group
    expect(groups.error).toHaveLength(1);
    expect(groups.error[0].sourceDocument.id).toBe("doc_e1");
    // Should include its pending entries if any
    expect(groups.error[0].ledgerEntries).toHaveLength(1);
    expect(groups.error[0].ledgerEntries[0].id).toBe("entry_2");

    // Verify Pending Group
    // Should contain doc_pending1 because it has pending entries and is NOT in active list
    expect(groups.pending).toHaveLength(1);
    expect(groups.pending[0].sourceDocument.id).toBe("doc_pending1");
    expect(groups.pending[0].ledgerEntries[0].id).toBe("entry_1");

    // Verify Completed Group
    // Should contain doc_c1
    // Should NOT contain doc_pending1 (because it was taken by pending group)
    // Should NOT contain doc_error1 (taken by error group)
    expect(groups.completed).toHaveLength(1);
    expect(groups.completed[0].sourceDocument.id).toBe("doc_c1");
});

it("filters groups by date range", async () => {
    // All mocks same as above
    (fetchSourceDocuments as any).mockResolvedValue({ items: [], nextCursor: null });
    (fetchLedgerEntries as any).mockResolvedValue({ items: [] });

    // Mock specific returns for this test to control dates easier if needed, 
    // but existing mocks have dates:
    // doc_c1: 2024-01-01 (Jan 1)
    // doc_q1: 2024-01-04 (Jan 4)

    // Let's reuse the mocks implementation pattern
    (fetchSourceDocuments as any).mockImplementation((_id: string, params: any) => {
        if (params?.status?.includes('queued')) {
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

    // Jan 4 doc should be present
    expect(result.current.groups.processing).toHaveLength(1);
    expect(result.current.groups.processing[0].sourceDocument.id).toBe("doc_q1");

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

    (fetchSourceDocuments as any).mockImplementation((_id: string, params: any) => {
        if (params?.status?.includes('queued')) {
            return Promise.resolve({ items: [mockSourceDocs.queued, docOutOfRange] });
        }
        return Promise.resolve({ items: [] });
    });

    const { result: result2 } = renderHook(
        () => useUnifiedSourceDocuments("ledger_1", { dateRange }),
        { wrapper }
    );

    await waitFor(() => expect(result2.current.isLoading).toBe(false));

    // processing group should have 1 (doc_q1), out of range filtered
    expect(result2.current.groups.processing).toHaveLength(1);
    expect(result2.current.groups.processing[0].sourceDocument.id).toBe("doc_q1");
});
});
