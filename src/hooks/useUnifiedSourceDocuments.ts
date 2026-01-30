'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchSourceDocuments, fetchLedgerEntries } from '@/lib/api';
import { SourceDocument, LedgerEntry } from '@/types/api';
import { queryKeys } from '@/lib/query-keys';

export type SourceDocumentStatus = 'processing' | 'anomaly' | 'completed';

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
                status: ['completed'],
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
            const res = await fetchLedgerEntries(ledgerId, { limit: 500 });
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
            const entries = confirmedEntriesByDoc.get(doc.id) || [];

            if (doc.status === 'anomaly') {
                result.anomaly.push({ sourceDocument: doc, ledgerEntries: entries });
            } else {
                // queued or processing
                result.processing.push({ sourceDocument: doc, ledgerEntries: entries });
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
    }, [activeDocuments, confirmedEntries, completedData]); // Removed isDateInRange from here as it is not used in grouped

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
        stats: {
            processingCount: filteredGroups.processing.length,
            anomalyCount: filteredGroups.anomaly.length,
        },
        isLoading: isActiveLoading || isCompletedLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    };
}
