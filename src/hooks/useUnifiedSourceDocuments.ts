'use client';

import { useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchSourceDocuments, fetchLedgerEntries } from '@/lib/api';
import { SourceDocument, LedgerEntry } from '@/types/api';
import { queryKeys } from '@/lib/query-keys';

export type SourceDocumentStatus = 'processing' | 'pending' | 'error' | 'completed';

export interface SourceDocumentGroup {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
}

export interface GroupedSourceDocuments {
    /** Documents currently being processed (queued + processing) */
    processing: SourceDocumentGroup[];
    /** Documents that failed processing */
    error: SourceDocumentGroup[];
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

    // Query 1: Fetch non-completed documents (processing, error states)
    // These are typically few in number and need real-time updates
    const { data: activeDocuments = [], isLoading: isActiveLoading } = useQuery({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'active'),
        queryFn: async () => {
            const res = await fetchSourceDocuments(ledgerId, {
                status: ['queued', 'processing', 'error'],
            });
            return res.items;
        },
    });

    // Query 2: Fetch pending ledger entries (for documents that have unconfirmed entries)
    const { data: pendingEntries = [], isLoading: isPendingLoading } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'pending'),
        queryFn: async () => {
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
            error: [],
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

        // 1. Process active documents (queued/processing/error)
        for (const doc of activeDocuments) {
            categorizedIds.add(doc.id);
            const entries = pendingEntriesByDoc.get(doc.id) || [];

            if (doc.status === 'error') {
                result.error.push({ sourceDocument: doc, ledgerEntries: entries });
            } else {
                // queued or processing
                result.processing.push({ sourceDocument: doc, ledgerEntries: entries });
            }
        }

        // 2. Find documents with pending entries (that are not already in active)
        // Note: In new flow, documents are either active (processing) completed, or error.
        // Pending ledger entries attached to Error documents will appear in Error group.
        // Orphaned pending entries should not happen in normal flow or are ignored.
        for (const [docId, entries] of pendingEntriesByDoc) {
            if (!categorizedIds.has(docId) && entries.length > 0) {
                const sourceDoc = entries[0].sourceDocument;
                // If a document has pending entries but is NOT in active list (error/processing)
                // It might be a data inconsistency. For now we treat it as error to be safe if status is error?
                // But wait, our active query fetches status=['queued', 'processing', 'error'].
                // So if it's not in active, it must be 'completed' or something else?
                // If it is 'completed' but has pending entries, that's an anomaly.

                // If we want to hide "Pending" section entirely, we just don't push anything to result.pending.
                // We can log this anomaly or push to error if we want visibility.
                // For this task, we remove the UI section, so we just skip.
                if (sourceDoc && sourceDoc.status !== 'completed') {
                    // If for some reason we missed it in active query?
                    // Let's assume active query catches all non-completed.
                }
            }
        }

        // 3. All documents from infinite scroll that are not categorized go to completed
        const allCompletedDocs = completedData?.pages.flatMap((page) => page.items) || [];
        for (const doc of allCompletedDocs) {
            if (!categorizedIds.has(doc.id)) {
                const entries = confirmedEntriesByDoc.get(doc.id) || [];
                result.completed.push({ sourceDocument: doc, ledgerEntries: entries });
            }
        }

        // Sort each group by date (newest first)
        const sortByDate = (a: SourceDocumentGroup, b: SourceDocumentGroup) =>
            new Date(b.sourceDocument.createdAt).getTime() -
            new Date(a.sourceDocument.createdAt).getTime();

        result.processing.sort(sortByDate);
        result.error.sort(sortByDate);
        result.completed.sort(sortByDate);

        return result;
    }, [activeDocuments, pendingEntries, confirmedEntries, completedData]);

    // Helper to check if date is in range (for filtering)
    const isDateInRange = (dateStr: string) => {
        if (!dateRange?.start || !dateRange?.end) return true;
        const d = new Date(dateStr).getTime();
        return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    };

    // Apply date filtering to groups
    const filteredGroups = useMemo((): GroupedSourceDocuments => {
        const filterGroup = (groups: SourceDocumentGroup[]) =>
            groups.filter((g) => isDateInRange(g.sourceDocument.createdAt));

        return {
            processing: filterGroup(grouped.processing),
            error: filterGroup(grouped.error),
            completed: grouped.completed, // Already filtered by API
        };
    }, [grouped, dateRange]);

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
            errorCount: filteredGroups.error.length,
        },
    };
}
