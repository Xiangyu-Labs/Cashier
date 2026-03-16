import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSmartPolling } from '@/hooks/use-smart-polling';
import { getAllSourceDocumentsAction } from "@/features/source-document/server/actions";
import type { SourceDocumentWithEntries } from "@/features/source-document/server/actions/types";
import { queryKeys } from '@/lib/query-keys';
import { formatDateTimeForApi } from '@/lib/date-utils';
import {
    groupSourceDocumentsByStatus,
    calculateSourceDocumentStats,
    type GroupedSourceDocuments,
} from "@/features/source-document/lib/grouping";
import { parseAmount } from "@/lib/formatters";

// Re-export type for convenience
export type { SourceDocumentWithEntries };

// Re-export types from grouping lib for backward compatibility
export type GroupedSourceDocumentsWithEntries = GroupedSourceDocuments<SourceDocumentWithEntries>;

export interface SourceDocumentsStats {
    queuedCount: number;
    processingCount: number;
    anomalyCount: number;
    failedCount: number;
}

interface UseSourceDocumentsOptions {
    dateRange?: {
        start?: Date;
        end?: Date;
    };
    minAmount?: number;
    maxAmount?: number;
}

/**
 * Helper to calculate total converted amount for a source document
 */
function calculateTotalAmount(doc: SourceDocumentWithEntries): number {
    if (!doc.ledgerEntries?.length) return 0;
    return doc.ledgerEntries.reduce((sum, entry) => {
        const convertedAmount = entry.convertedAmount;
        const amount = convertedAmount
            ? parseAmount(convertedAmount)
            : parseAmount(entry.amount);
        return sum + Math.abs(amount);
    }, 0);
}

/**
 * Helper to filter and group source documents
 */
function filterAndGroup(
    docs: SourceDocumentWithEntries[],
    minAmount?: number,
    maxAmount?: number
): { groups: GroupedSourceDocuments<SourceDocumentWithEntries>; stats: SourceDocumentsStats } {
    // Apply amount filtering
    let filtered = docs;
    if (minAmount !== undefined || maxAmount !== undefined) {
        filtered = docs.filter(doc => {
            const total = calculateTotalAmount(doc);
            if (minAmount !== undefined && total < minAmount) return false;
            if (maxAmount !== undefined && total > maxAmount) return false;
            return true;
        });
    }

    const groups = groupSourceDocumentsByStatus(filtered);
    const stats = calculateSourceDocumentStats(groups);

    return { groups, stats };
}

/**
 * New unified hook for fetching and grouping source documents.
 *
 * Uses a flat cache structure with React Query's `select` for grouping/filtering.
 * This enables simple optimistic updates (just update the flat array).
 *
 * @example
 * ```typescript
 * const { groups, stats, isLoading } = useSourceDocuments(ledgerId, {
 *   dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
 *   minAmount: 100,
 *   maxAmount: 1000,
 * });
 * ```
 */
export function useSourceDocuments(
    ledgerId: string,
    options: UseSourceDocumentsOptions = {}
) {
    const { dateRange, minAmount, maxAmount } = options;

    const startDate = formatDateTimeForApi(dateRange?.start) || null;
    const endDate = formatDateTimeForApi(dateRange?.end) || null;

    // Single query with flat cache structure
    // The 'all' key stores the raw flat array
    const { data: response, isLoading } = useSmartPolling({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'all', startDate, endDate),
        queryFn: () => getAllSourceDocumentsAction(ledgerId, {
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
        }),
        isActive: (data) => {
            if (!data) return false;
            return data.items.some(doc =>
                doc.status === 'queued' ||
                doc.status === 'processing' ||
                doc.status === 'parsing'
            );
        },
        interval: 3000,
        ledgerId,
    });

    // Extract items from paginated response
    const rawData = response?.items;

    // Use useMemo to apply client-side grouping and filtering
    // This replaces the server-side grouping from the old hook
    const { groups, stats } = useMemo(() => {
        if (!rawData) {
            return {
                groups: {
                    queued: [],
                    processing: [],
                    anomaly: [],
                    failed: [],
                    completed: [],
                },
                stats: {
                    queuedCount: 0,
                    processingCount: 0,
                    anomalyCount: 0,
                    failedCount: 0,
                },
            };
        }

        return filterAndGroup(rawData, minAmount, maxAmount);
    }, [rawData, minAmount, maxAmount]);

    return {
        // Grouped data for UI
        groups,
        stats,
        // Raw flat data for optimistic updates
        rawData,
        isLoading,
    };
}

/**
 * Hook to get a single source document by ID from the cache.
 * Useful for optimistic updates in mutations.
 */
export function useSourceDocumentFromCache(ledgerId: string, id: string | null) {
    const queryClient = useQueryClient();

    return useMemo(() => {
        if (!id) return null;

        // Get all cached queries for this ledger
        const queries = queryClient.getQueriesData<SourceDocumentWithEntries[]>({
            queryKey: queryKeys.sourceDocuments(ledgerId, 'all'),
        });

        // Find the document in any of the cached data
        for (const [, data] of queries) {
            if (data) {
                const doc = data.find(d => d.id === id);
                if (doc) return doc;
            }
        }

        return null;
    }, [queryClient, ledgerId, id]);
}

// Re-export types for backward compatibility
export type { UseSourceDocumentsOptions };
