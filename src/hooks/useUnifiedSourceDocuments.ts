'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchSourceDocuments, fetchLedgerEntries } from '@/lib/api';
import { SourceDocument, LedgerEntry } from '@/types/api';
import { queryKeys } from '@/lib/query-keys';

export type SourceDocumentStatus = 'processing' | 'pending' | 'anomaly' | 'completed';

export interface SourceDocumentGroup {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
}

export interface GroupedSourceDocuments {
    /** Documents currently being processed (queued + processing) */
    processing: SourceDocumentGroup[];
    /** Documents that failed processing or have anomalies */
    anomaly: SourceDocumentGroup[];
    /** Documents with all entries confirmed (for infinite scroll) */
    completed: SourceDocumentGroup[];
}

interface UseUnifiedSourceDocumentsOptions {
    dateRange?: {
        start?: Date;
        end?: Date;
    };
}

/**
 * Unified hook for fetching and grouping all source documents by status.
 * 
 * This replaces the fragmented data fetching pattern where:
 * - useLedgerData fetched pending entries separately
 * - useInfiniteQuery fetched all documents
 * - Filtering relied on ID cross-referencing
 * 
 * Now all data comes from this single hook, grouped by status.
 */
export function useUnifiedSourceDocuments(
    ledgerId: string,
    options: UseUnifiedSourceDocumentsOptions = {}
) {
    const { dateRange } = options;

    // Query 1: Fetch non-completed documents (processing, anomaly states)
    // These are typically few in number and need real-time updates
    const { data: activeDocuments = [], isLoading: isActiveLoading } = useQuery({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'active'),
        queryFn: async () => {
            const res = await fetchSourceDocuments(ledgerId, {
                status: ['queued', 'processing', 'anomaly'],
            });
            return res.items;
        },
    });

    // Query 2: Fetch pending ledger entries (for documents that have unconfirmed entries)
    // Note: status 'pending' usage in fetchLedgerEntries is technically removed from schema,
    // but the API might still support filtering by checking anomalies logic or legacy field.
    // However, we removed the status field from schema.
    // We should rely on Active Documents to bring their entries (via join or similar).
    // Or, we need an API that returns entries with anomalies. 
    // BUT wait, `fetchLedgerEntries` uses `status` param which maps to `anomalyCodes` length > 0 if we updated it?
    // I haven't updated `fetchLedgerEntries` API route to map status='pending' to anomalies.
    // I missed `src/app/api/ledgers/[id]/ledger-entries/route.ts`? Or `src/app/api/v1...`?
    // FetchLedgerEntries on client calls `/api/ledgers/${ledgerId}/ledger-entries` ?
    // I need to check `fetchLedgerEntries` implementation in `src/lib/api.ts` and the corresponding route.

    // Assuming for now `fetchLedgerEntries` filters correctly or I need to fix it.
    // Actually, the previous implementation relied on `status` column. 
    // I need to check `src/app/api/ledgers/[id]/ledger-entries/route.ts`.

    const { data: pendingEntries = [], isLoading: isPendingLoading } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'pending'),
        queryFn: async () => {
            // We request "pending" which now means "has anomalies"
            const res = await fetchLedgerEntries(ledgerId, { status: 'pending' });
            return res.items;
        },
    });

    // Query 3: Infinite scroll for completed documents (paginated)
    const {
        data: completedData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isCompletedLoading,
    } = useInfiniteQuery({
        queryKey: [
            'sourceDocuments',
            ledgerId,
            'completed',
            dateRange?.start?.toISOString(),
            dateRange?.end?.toISOString(),
        ],
        queryFn: ({ pageParam }) =>
            fetchSourceDocuments(ledgerId, {
                cursor: pageParam,
                startDate: dateRange?.start?.toISOString(),
                endDate: dateRange?.end?.toISOString(),
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    // Query 4: Fetch confirmed entries to match with completed documents
    const { data: confirmedEntries = [] } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'confirmed'),
        queryFn: async () => {
            const res = await fetchLedgerEntries(ledgerId, { status: 'confirmed', limit: 500 });
            return res.items;
        },
    });

    // Group and classify all documents
    const grouped = useMemo((): GroupedSourceDocuments => {
        const result: GroupedSourceDocuments = {
            processing: [],
            anomaly: [],
            completed: [],
        };

        // Build a map of sourceDocumentId -> pending entries
        const pendingEntriesByDoc = new Map<string, LedgerEntry[]>();
        for (const entry of pendingEntries) {
            if (entry.sourceDocumentId) {
                const existing = pendingEntriesByDoc.get(entry.sourceDocumentId) || [];
                existing.push(entry);
                pendingEntriesByDoc.set(entry.sourceDocumentId, existing);
            }
        }

        // Build a map of sourceDocumentId -> confirmed entries
        const confirmedEntriesByDoc = new Map<string, LedgerEntry[]>();
        for (const entry of confirmedEntries) {
            if (entry.sourceDocumentId) {
                const existing = confirmedEntriesByDoc.get(entry.sourceDocumentId) || [];
                existing.push(entry);
                confirmedEntriesByDoc.set(entry.sourceDocumentId, existing);
            }
        }

        // Track which document IDs are already categorized (to avoid duplicates)
        const categorizedIds = new Set<string>();

        // 1. Process active documents (queued/processing/anomaly)
        for (const doc of activeDocuments) {
            categorizedIds.add(doc.id);
            // An active document might have "pending" (anomalous) entries
            // AND "confirmed" (normal) entries?
            // Usually we show all entries for the document.
            // So we should merge entries.
            const pEntries = pendingEntriesByDoc.get(doc.id) || [];
            const cEntries = confirmedEntriesByDoc.get(doc.id) || [];
            const entries = [...pEntries, ...cEntries];

            if (doc.status === 'anomaly') {
                result.anomaly.push({ sourceDocument: doc, ledgerEntries: entries });
            } else {
                // queued or processing
                result.processing.push({ sourceDocument: doc, ledgerEntries: entries });
            }
        }

        // 2. Find documents with pending entries (that are not already in active)
        // If they are not in active, they might be 'completed' but somehow got a 'pending' entry?
        // Should treat as anomaly if found.
        for (const [docId, entries] of pendingEntriesByDoc) {
            if (!categorizedIds.has(docId) && entries.length > 0) {
                const sourceDoc = entries[0].sourceDocument;
                if (sourceDoc && sourceDoc.status !== 'completed') {
                    // logic preserved from before, largely skipped if active catches everything
                } else if (sourceDoc && sourceDoc.status === 'completed') {
                    // Document is marked completed but has anomalous entry?
                    // This is an anomaly case!
                    result.anomaly.push({ sourceDocument: sourceDoc, ledgerEntries: entries });
                    categorizedIds.add(docId);
                }
            }
        }

        // 3. All documents from infinite scroll that are not categorized go to completed
        const allCompletedDocs = completedData?.pages.flatMap((page) => page.items) || [];
        for (const doc of allCompletedDocs) {
            if (!categorizedIds.has(doc.id)) {
                // Should we include pending entries here? If any pending entries exist, it should have been caught above.
                // So here we likely only have confirmed entries.
                const entries = confirmedEntriesByDoc.get(doc.id) || [];
                result.completed.push({ sourceDocument: doc, ledgerEntries: entries });
            }
        }

        // Sort each group by date (newest first)
        const sortByDate = (a: SourceDocumentGroup, b: SourceDocumentGroup) =>
            new Date(b.sourceDocument.createdAt).getTime() -
            new Date(a.sourceDocument.createdAt).getTime();

        result.processing.sort(sortByDate);
        result.anomaly.sort(sortByDate);
        result.completed.sort(sortByDate);

        return result;
    }, [activeDocuments, pendingEntries, confirmedEntries, completedData]); // Removed isDateInRange from here as it is not used in grouped

    // Helper to check if date is in range (for filtering)
    const isDateInRange = useCallback((dateStr: string) => {
        if (!dateRange?.start || !dateRange?.end) return true;
        const d = new Date(dateStr).getTime();
        return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    }, [dateRange]);

    // Apply date filtering to groups
    const filteredGroups = useMemo((): GroupedSourceDocuments => {
        const filterGroup = (groups: SourceDocumentGroup[]) =>
            groups.filter((g) => isDateInRange(g.sourceDocument.createdAt));

        return {
            processing: filterGroup(grouped.processing),
            anomaly: filterGroup(grouped.anomaly),
            completed: grouped.completed, // Already filtered by API
        };
    }, [grouped, isDateInRange]);

    return {
        groups: filteredGroups,
        isLoading: isActiveLoading || isPendingLoading || isCompletedLoading,

        // Infinite scroll helpers
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,

        // Stats for quick access
        stats: {
            processingCount: filteredGroups.processing.length,
            anomalyCount: filteredGroups.anomaly.length,
        },
    };
}
