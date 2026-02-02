import { useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartPolling } from '@/hooks/use-smart-polling';
import { getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { SourceDocument, LedgerEntry } from '@/types/api';

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
 * Optimized to offload grouping and filtering to the server.
 */
export function useUnifiedSourceDocuments(
    ledgerId: string,
    options: UseUnifiedSourceDocumentsOptions = {}
) {
    const { dateRange } = options;

    const startDate = dateRange?.start?.toISOString() || null;
    const endDate = dateRange?.end?.toISOString() || null;

    const queryClient = useQueryClient();
    const prevProcessingCount = useRef<number | null>(null);

    // Query 1: Fetch grouped documents (active docs + first page of completed)
    const { data: unifiedData, isLoading: isUnifiedLoading } = useSmartPolling({
        queryKey: [
            'sourceDocuments',
            ledgerId,
            'unified',
            startDate,
            endDate,
        ],
        queryFn: () => getUnifiedSourceDocumentsAction(ledgerId, {
            startDate,
            endDate,
        }),
        isActive: (data) => (data?.groups?.processing?.length || 0) > 0,
        interval: 3000,
    });

    // Invalidate infinite completed list if processing count drops (transition to completed/anomaly)
    const currentProcessingCount = unifiedData?.groups?.processing?.length || 0;
    useEffect(() => {
        if (prevProcessingCount.current !== null && currentProcessingCount < prevProcessingCount.current) {
            // Document finished processing - invalidate the completed infinite list
            queryClient.invalidateQueries({
                queryKey: [
                    'sourceDocuments',
                    ledgerId,
                    'completed',
                    startDate,
                    endDate,
                ]
            });
        }
        prevProcessingCount.current = currentProcessingCount;
    }, [currentProcessingCount, ledgerId, startDate, endDate, queryClient]);

    // Query 2: Infinite scroll for additional completed documents
    const {
        data: infiniteCompletedData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isInfiniteLoading,
    } = useInfiniteQuery({
        queryKey: [
            'sourceDocuments',
            ledgerId,
            'completed',
            startDate,
            endDate,
        ],
        queryFn: async ({ pageParam }) => {
            const res = await getUnifiedSourceDocumentsAction(ledgerId, {
                cursor: pageParam as string | null,
                startDate,
                endDate,
            });
            return {
                items: res.groups.completed,
                nextCursor: res.nextCursor
            };
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // Only start infinite loading after the first page is fetched via unifiedData
        // or if we have initial data (though unifiedData is better for consistency)
        enabled: !!unifiedData,
    });

    const groups = useMemo((): GroupedSourceDocuments => {
        if (!unifiedData) {
            return {
                processing: [],
                anomaly: [],
                completed: [],
            };
        }

        // Combine the first page from unifiedData with subsequent pages from infiniteCompletedData
        const _completed: SourceDocumentGroup[] = unifiedData.groups.completed as unknown as SourceDocumentGroup[];

        if (infiniteCompletedData) {
            // Skip the first page of infinite query if it's the same as unifiedData's completed?
            // Actually, infinite query starts with pageParam=undefined, which returns the first page.
            // If unifiedData already includes the first page, we should avoid duplicates.
            // But getUnifiedSourceDocumentsAction with no cursor returns the first page.

            // To simplify: let's make infinite query only responsible for pages AFTER the first.
            // However, TanStack Query's useInfiniteQuery usually handles the first page too.

            // Alternative: useUnifiedSourceDocuments only uses infinite query for COMPLETED.
            // And useQuery for ACTIVE. This keeps them separate but uses server-side logic.

            // Let's stick to the separation for now to avoid complexity with cursor management.
            // Query 1 (Active Docs) + Query 2 (Infinite Completed Docs)
        }

        return {
            processing: unifiedData.groups.processing as unknown as SourceDocumentGroup[],
            anomaly: unifiedData.groups.anomaly as unknown as SourceDocumentGroup[],
            completed: (infiniteCompletedData
                ? infiniteCompletedData.pages.flatMap(page => page.items)
                : unifiedData.groups.completed) as unknown as SourceDocumentGroup[]
        };
    }, [unifiedData, infiniteCompletedData]);

    return {
        groups,
        stats: unifiedData?.stats || { processingCount: 0, anomalyCount: 0 },
        isLoading: isUnifiedLoading && !unifiedData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage: isFetchingNextPage || isInfiniteLoading,
    };
}
