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
    // Poll for queued/processing source documents - Polling REMOVED in favor of SSE
    const { data: queuedSourceDocuments = [] } = useQuery({
        queryKey: ["sourceDocuments", ledgerId, "queued"],
        queryFn: async () => {
            // We fetch all non-completed ones to show status
            const res = await fetchSourceDocuments(ledgerId, { status: ["queued", "processing", "error"] });
            return res.items;
        },
    });

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
    });

    const { data: confirmedEntries } = useQuery({
        queryKey: ["ledgerEntries", ledgerId, "confirmed"],
        queryFn: async () => {
            const res = await fetchLedgerEntries(ledgerId, { status: "confirmed", limit: 100 });
            return res.items;
        },
    });

    const { data: summary } = useQuery({
        queryKey: ["summary", ledgerId],
        queryFn: () => fetchLedgerEntrySummary(ledgerId, "confirmed"),
    });

    const pendingGroups = useMemo(() => groupLedgerEntries(pendingEntries), [pendingEntries]);
    const confirmedGroups = useMemo(() => groupLedgerEntries(confirmedEntries), [confirmedEntries]);

    const processingDocs = queuedSourceDocuments?.filter((m) => m.status === "processing") || [];
    const queuedOnlyDocs = queuedSourceDocuments?.filter((m) => m.status === "queued") || [];
    const failedDocs = queuedSourceDocuments?.filter((m) => m.status === "error") || [];

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
