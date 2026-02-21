import { useSmartPolling } from '@/hooks/use-smart-polling';
import { getPendingSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { queryKeys } from '@/lib/query-keys';
import { SourceDocumentGroup } from './useUnifiedSourceDocuments';

export interface PendingSourceDocumentsResult {
    /** Documents waiting in queue */
    queued: SourceDocumentGroup[];
    /** Documents currently being processed */
    processing: SourceDocumentGroup[];
    /** Documents that failed with business anomalies */
    anomaly: SourceDocumentGroup[];
    /** Documents that failed with system errors */
    failed: SourceDocumentGroup[];
}

/**
 * Hook for fetching pending source documents (queued + processing + anomaly).
 * 
 * This hook fetches ALL pending documents regardless of date range,
 * used for the pending bills modal that should always show all items.
 */
export function usePendingSourceDocuments(ledgerId: string) {
    const { data, isLoading, refetch } = useSmartPolling({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
        queryFn: () => getPendingSourceDocumentsAction(ledgerId),
        isActive: (data) => (data?.stats?.queuedCount || 0) > 0 || (data?.stats?.processingCount || 0) > 0,
        interval: 3000,
    });

    return {
        groups: {
            queued: (data?.groups?.queued || []) as SourceDocumentGroup[],
            processing: (data?.groups?.processing || []) as SourceDocumentGroup[],
            anomaly: (data?.groups?.anomaly || []) as SourceDocumentGroup[],
            failed: (data?.groups?.failed || []) as SourceDocumentGroup[],
        },
        stats: data?.stats || { queuedCount: 0, processingCount: 0, anomalyCount: 0, failedCount: 0, total: 0 },
        isLoading: isLoading && !data,
        refetch,
    };
}

