'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getSourceDocumentsAction } from "@/features/source-document/server/actions/main";
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
 * Optimized to fetch ledger entries joined from the server.
 */
export function useUnifiedSourceDocuments(
    ledgerId: string,
    options: UseUnifiedSourceDocumentsOptions & {
        initialActive?: SourceDocument[];
        initialCompletedPages?: { items: SourceDocument[]; nextCursor: string | null }[];
    } = {}
) {
    const { dateRange, initialActive, initialCompletedPages } = options;

    // Type definition for API response item which includes ledgerEntries
    type SourceDocumentWithEntries = SourceDocument & { ledgerEntries?: LedgerEntry[] };

    // Query 1: Fetch non-completed documents (processing, anomaly states)
    // These are typically few in number and need real-time updates
    const { data: activeDocuments = (initialActive as SourceDocumentWithEntries[]) || [], isLoading: isActiveLoading } = useQuery<SourceDocumentWithEntries[]>({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'active'),
        queryFn: async () => {
            const res = await getSourceDocumentsAction(ledgerId, {
                status: 'queued,processing,anomaly',
                includeLedgerEntries: true,
            });
            return res.items as SourceDocumentWithEntries[];
        },
        initialData: initialActive,
    });

    // Query 2: Infinite scroll for completed documents (paginated)
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
        queryFn: async ({ pageParam }) => {
            const res = await getSourceDocumentsAction(ledgerId, {
                cursor: pageParam as string | null,
                status: 'completed',
                startDate: dateRange?.start?.toISOString() || null,
                endDate: dateRange?.end?.toISOString() || null,
                includeLedgerEntries: true,
            });
            return {
                items: res.items as SourceDocumentWithEntries[],
                nextCursor: res.nextCursor
            };
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialData: initialCompletedPages ? {
            pages: initialCompletedPages,
            pageParams: [undefined],
        } : undefined,
    });

    // Helper to filter by date (for active docs which are fetched in one batch)
    const isDateInRange = useCallback((dateStr: string) => {
        if (!dateRange?.start || !dateRange?.end) return true;
        const d = new Date(dateStr).getTime();
        return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    }, [dateRange]);

    // Group documents
    const groups = useMemo((): GroupedSourceDocuments => {
        const result: GroupedSourceDocuments = {
            processing: [],
            anomaly: [],
            completed: [],
        };

        // 1. Process active documents
        for (const doc of activeDocuments) {
            // Filter by date client-side for active docs
            if (!isDateInRange(doc.createdAt)) continue;

            const group: SourceDocumentGroup = {
                sourceDocument: doc,
                ledgerEntries: doc.ledgerEntries || []
            };

            if (doc.status === 'anomaly') {
                result.anomaly.push(group);
            } else if (doc.status === 'completed') {
                // Rare case: active query caught a completed one (race condition or cache)
                result.completed.push(group);
            } else {
                // queued or processing
                result.processing.push(group);
            }
        }

        // 2. Process completed documents from infinite scroll
        // These are already filtered by date on server
        if (completedData) {
            for (const page of completedData.pages) {
                const items = page.items as SourceDocumentWithEntries[];
                for (const doc of items) {
                    result.completed.push({
                        sourceDocument: doc,
                        ledgerEntries: doc.ledgerEntries || []
                    });
                }
            }
        }

        // 3. Client-side Sort (safety, though server sorts desc)
        const sortByDate = (a: SourceDocumentGroup, b: SourceDocumentGroup) =>
            new Date(b.sourceDocument.createdAt).getTime() -
            new Date(a.sourceDocument.createdAt).getTime();

        result.processing.sort(sortByDate);
        result.anomaly.sort(sortByDate);
        // result.completed is already sorted by server (pagination order), 
        // sorting it again might mix pages if they overlap in time (unlikely with cursor)
        // but let's keep it safe or skip it to safe perf?
        // Skip for completed to respect server pagination order.

        return result;
    }, [activeDocuments, completedData, isDateInRange]);

    return {
        groups,
        stats: {
            processingCount: groups.processing.length,
            anomalyCount: groups.anomaly.length,
        },
        isLoading: isActiveLoading || isCompletedLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    };
}
