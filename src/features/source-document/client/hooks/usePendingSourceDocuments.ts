import { useSmartPolling } from '@/hooks/use-smart-polling';
import { fetchPendingSourceDocuments } from "@/lib/fetchers";
import { queryKeys } from '@/lib/query-keys';
import { SourceDocumentGroup } from './useUnifiedSourceDocuments';

export interface PendingSourceDocumentsResult {
    /** Documents currently being processed (queued + processing) */
    processing: SourceDocumentGroup[];
    /** Documents that failed processing or have anomalies */
    anomaly: SourceDocumentGroup[];
}

/**
 * Hook for fetching pending source documents (processing + anomaly).
 * 
 * This hook fetches ALL pending documents regardless of date range,
 * used for the pending bills modal that should always show all items.
 */
export function usePendingSourceDocuments(ledgerId: string) {
    const { data, isLoading, refetch } = useSmartPolling({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
        queryFn: () => fetchPendingSourceDocuments(ledgerId),
        isActive: (data) => (data?.stats?.processingCount || 0) > 0,
        interval: 3000,
    });

    return {
        groups: {
            processing: (data?.groups?.processing || []) as SourceDocumentGroup[],
            anomaly: (data?.groups?.anomaly || []) as SourceDocumentGroup[],
        },
        stats: data?.stats || { processingCount: 0, anomalyCount: 0, total: 0 },
        isLoading: isLoading && !data,
        refetch,
    };
}
