import { useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchLedger,
    fetchLedgerEntries,
    fetchLedgerEntrySummary,
    fetchEntryCategories,
    fetchSourceDocuments,
} from "@/lib/api";
import { SourceDocument, LedgerEntry } from "@/types/api";

type LedgerEntryBatch = {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
};

type GroupedLedgerEntries = {
    batches: LedgerEntryBatch[];
    others: LedgerEntry[];
};

function groupLedgerEntries(ledgerEntries?: LedgerEntry[]): GroupedLedgerEntries {
    if (!ledgerEntries) return { batches: [], others: [] };

    const batches: Record<string, LedgerEntryBatch> = {};
    const others: LedgerEntry[] = [];

    for (const entry of ledgerEntries) {
        if (entry.sourceDocument && entry.sourceDocumentId) {
            if (!batches[entry.sourceDocumentId]) {
                batches[entry.sourceDocumentId] = {
                    sourceDocument: entry.sourceDocument,
                    ledgerEntries: [],
                };
            }
            batches[entry.sourceDocumentId].ledgerEntries.push(entry);
        } else {
            others.push(entry);
        }
    }

    const sortedBatches = Object.values(batches).sort((a, b) =>
        new Date(b.sourceDocument.createdAt).getTime() - new Date(a.sourceDocument.createdAt).getTime()
    );

    return {
        batches: sortedBatches,
        others,
    };
}

export function useLedgerData(ledgerId: string) {
    const queryClient = useQueryClient();

    // Poll for queued/processing source documents first to determine if we need to poll others
    const { data: queuedSourceDocuments = [] } = useQuery({
        queryKey: ["sourceDocuments", ledgerId, "queued"],
        queryFn: async () => {
            const res = await fetchSourceDocuments(ledgerId, { status: ["queued", "processing", "failed", "invalid"] });
            return res.items;
        },
        refetchInterval: (query) => {
            const data = query.state.data;
            return data && data.length > 0 ? 1000 : 5000;
        },
    });

    const isProcessing = queuedSourceDocuments?.some(m => m.status === 'queued' || m.status === 'processing');
    const refetchInterval = isProcessing ? 1000 : false;

    // Track previous queue length to detect completion
    const prevQueueLengthRef = useRef(queuedSourceDocuments?.length || 0);

    useEffect(() => {
        const currentLength = queuedSourceDocuments?.length || 0;
        // If queue size decreased, something finished processing (or was deleted)
        // In either case, we should refresh ledger entries to show the result
        if (currentLength < prevQueueLengthRef.current) {
            queryClient.invalidateQueries({ queryKey: ["ledgerEntries", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        }
        prevQueueLengthRef.current = currentLength;
    }, [queuedSourceDocuments?.length, queryClient, ledgerId]);

    const { data: ledger, isLoading: isLedgerLoading } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => fetchLedger(ledgerId),
    });

    const { data: categories } = useQuery({
        queryKey: ["entryCategories", ledgerId],
        queryFn: () => fetchEntryCategories(ledgerId),
    });

    const { data: pendingEntries } = useQuery({
        queryKey: ["ledgerEntries", ledgerId, "pending"],
        queryFn: async () => {
            const res = await fetchLedgerEntries(ledgerId, { status: "pending" });
            return res.items;
        },
        refetchInterval,
    });

    const { data: confirmedEntries } = useQuery({
        queryKey: ["ledgerEntries", ledgerId, "confirmed"],
        queryFn: async () => {
            const res = await fetchLedgerEntries(ledgerId, { status: "confirmed", limit: 100 });
            return res.items;
        },
        refetchInterval,
    });

    const { data: summary } = useQuery({
        queryKey: ["summary", ledgerId],
        queryFn: () => fetchLedgerEntrySummary(ledgerId, "confirmed"),
        refetchInterval,
    });

    const pendingGroups = useMemo(() => groupLedgerEntries(pendingEntries), [pendingEntries]);
    const confirmedGroups = useMemo(() => groupLedgerEntries(confirmedEntries), [confirmedEntries]);

    const processingDocs = queuedSourceDocuments?.filter((m) => m.status === "processing") || [];
    const queuedOnlyDocs = queuedSourceDocuments?.filter((m) => m.status === "queued") || [];
    const failedDocs = queuedSourceDocuments?.filter((m) => m.status === "failed" || m.status === "invalid") || [];

    return {
        ledger,
        isLedgerLoading,
        categories: categories || [],
        confirmedEntries,
        summary,
        queuedSourceDocuments: queuedSourceDocuments || [],
        pendingGroups,
        confirmedGroups,
        stats: {
            processingCount: processingDocs.length,
            queuedCount: queuedOnlyDocs.length,
            failedCount: failedDocs.length,
        },
    };
}
