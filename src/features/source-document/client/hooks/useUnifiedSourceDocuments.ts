import { useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartPolling } from '@/hooks/use-smart-polling';
import { getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { queryKeys } from '@/lib/query-keys';
import { formatDateTimeForApi } from '@/lib/date-utils';
import { SourceDocument, LedgerEntry } from '@/types/api';
import { type SourceDocumentStatusType } from '@/features/source-document/server/schema';

export interface SourceDocumentGroup {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
}

export type SourceDocumentWithEntries = SourceDocument & {
    ledgerEntries?: LedgerEntry[];
};

export interface GroupedSourceDocuments {
    /** Documents waiting in queue */
    queued: SourceDocumentGroup[];
    /** Documents currently being processed */
    processing: SourceDocumentGroup[];
    /** Documents that failed with business anomalies */
    anomaly: SourceDocumentGroup[];
    /** Documents that failed with system errors */
    failed: SourceDocumentGroup[];
    /** Documents with all entries confirmed (for infinite scroll) */
    completed: SourceDocumentGroup[];
}

interface UseUnifiedSourceDocumentsOptions {
    dateRange?: {
        start?: Date;
        end?: Date;
    };
    minAmount?: number;
    maxAmount?: number;
    initialActiveSourceDocuments?: SourceDocumentWithEntries[];
    initialCompletedSourceDocuments?: SourceDocumentWithEntries[];
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
    const { dateRange, minAmount, maxAmount, initialActiveSourceDocuments, initialCompletedSourceDocuments } = options;

    const startDate = formatDateTimeForApi(dateRange?.start) || null;
    const endDate = formatDateTimeForApi(dateRange?.end) || null;

    const queryClient = useQueryClient();
    const prevProcessingCount = useRef<number | null>(null);

    // Prepare initial data if provided

    const initialUnifiedData = useMemo(() => {
        if (!initialActiveSourceDocuments && !initialCompletedSourceDocuments) return undefined;

        const queued: SourceDocumentGroup[] = [];
        const processing: SourceDocumentGroup[] = [];
        const anomaly: SourceDocumentGroup[] = [];
        const failed: SourceDocumentGroup[] = [];

        initialActiveSourceDocuments?.forEach(doc => {
            const group = {
                sourceDocument: doc,
                ledgerEntries: doc.ledgerEntries || []
            };
            if (doc.status === 'failed') {
                failed.push(group);
            } else if (doc.status === 'anomaly') {
                anomaly.push(group);
            } else if (doc.status === 'queued') {
                queued.push(group);
            } else {
                processing.push(group);
            }
        });

        return {
            groups: {
                queued,
                processing,
                anomaly,
                failed,
                completed: initialCompletedSourceDocuments?.map(doc => ({
                    sourceDocument: doc,
                    ledgerEntries: doc.ledgerEntries || []
                })) || []
            },
            nextCursor: null,
            stats: {
                queuedCount: queued.length,
                processingCount: processing.length,
                anomalyCount: anomaly.length,
                failedCount: failed.length
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial data only, dependencies are intentionally not tracked
    }, []);

    // Query 1: Fetch grouped documents (active docs + first page of completed)
    const { data: unifiedData, isLoading: isUnifiedLoading } = useSmartPolling({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'unified', startDate, endDate, minAmount, maxAmount),
        queryFn: () => getUnifiedSourceDocumentsAction(ledgerId, {
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
            minAmount: minAmount ?? undefined,
            maxAmount: maxAmount ?? undefined,
        }),
        isActive: (data) => (data?.groups?.queued?.length || 0) > 0 || (data?.groups?.processing?.length || 0) > 0,
        interval: 3000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData: initialUnifiedData as any,
    });

    // Invalidate infinite completed list if processing count drops (transition to completed/anomaly)
    const currentProcessingCount = (unifiedData?.groups?.queued?.length || 0) + (unifiedData?.groups?.processing?.length || 0);
    useEffect(() => {
        if (prevProcessingCount.current !== null && currentProcessingCount < prevProcessingCount.current) {
            // Document finished processing - invalidate the completed infinite list
            queryClient.invalidateQueries({
                queryKey: queryKeys.sourceDocuments(ledgerId, 'completed', startDate, endDate)
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
        queryKey: queryKeys.sourceDocuments(ledgerId, 'completed', startDate, endDate, minAmount, maxAmount),
        queryFn: async ({ pageParam }) => {
            const res = await getUnifiedSourceDocumentsAction(ledgerId, {
                cursor: pageParam as string | null,
                startDate: startDate ?? undefined,
                endDate: endDate ?? undefined,
                minAmount: minAmount ?? undefined,
                maxAmount: maxAmount ?? undefined,
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
                queued: [],
                processing: [],
                anomaly: [],
                failed: [],
                completed: [],
            };
        }

        // Helper function to deduplicate items by sourceDocument.id
        const deduplicateByDocId = (items: SourceDocumentGroup[]): SourceDocumentGroup[] => {
            const seen = new Set<string>();
            return items.filter(item => {
                const docId = item.sourceDocument?.id;
                if (!docId || seen.has(docId)) return false;
                seen.add(docId);
                return true;
            });
        };

        // Get completed items from infinite query or unified data
        const completedItems = (infiniteCompletedData
            ? infiniteCompletedData.pages.flatMap(page => page.items)
            : unifiedData.groups.completed) as unknown as SourceDocumentGroup[];

        return {
            queued: unifiedData.groups.queued as unknown as SourceDocumentGroup[],
            processing: unifiedData.groups.processing as unknown as SourceDocumentGroup[],
            anomaly: unifiedData.groups.anomaly as unknown as SourceDocumentGroup[],
            failed: (unifiedData.groups.failed || []) as unknown as SourceDocumentGroup[],
            // Deduplicate to prevent duplicates when cache is invalidated and pages are refetched
            completed: deduplicateByDocId(completedItems)
        };
    }, [unifiedData, infiniteCompletedData]);

    return {
        groups,
        stats: unifiedData?.stats || { queuedCount: 0, processingCount: 0, anomalyCount: 0, failedCount: 0 },
        isLoading: isUnifiedLoading && !unifiedData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage: isFetchingNextPage || isInfiniteLoading,
    };
}
