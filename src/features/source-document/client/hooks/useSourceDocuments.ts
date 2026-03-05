import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartPolling } from '@/hooks/use-smart-polling';
import { getAllSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { queryKeys } from '@/lib/query-keys';
import { formatDateTimeForApi } from '@/lib/date-utils';
import type { SourceDocument, LedgerEntry, EntryCategory } from '@/types/api';

// Type matching the actual data returned from getAllSourceDocumentsAction
export interface SourceDocumentWithEntries extends SourceDocument {
    ledgerEntries: (LedgerEntry & {
        category: EntryCategory | null;
    })[];
}

// Internal type for handling raw data with Date objects
interface RawSourceDocument {
    id: string;
    text: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    deletedAt: Date | string | null;
    type: string;
    title: string | null;
    status: string;
    metadata: SourceDocument['metadata'];
    ledgerId: string;
    imageUrls: string[] | null;
    anomalyReason: string | null;
    entryDate: string | null;
    ledgerEntries: RawLedgerEntry[];
}

interface RawLedgerEntry {
    id: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    deletedAt: Date | string | null;
    ledgerId: string;
    description: string | null;
    categoryId: string | null;
    sourceDocumentId: string;
    amount: string | number;
    currency: string | null;
    itemName: string;
    convertedAmount: string | null;
    entryDate?: string | null;
    exchangeRate: string | null;
    category: EntryCategory | null;
}

export interface SourceDocumentGroup {
    sourceDocument: SourceDocumentWithEntries;
    ledgerEntries: SourceDocumentWithEntries['ledgerEntries'];
}

export interface GroupedSourceDocuments {
    /** Documents waiting in queue */
    queued: SourceDocumentGroup[];
    /** Documents currently being processed */
    processing: SourceDocumentGroup[];
    /** Documents that failed with business anomalies */
    anomaly: SourceDocumentGroup[];
    /** Documents that failed with system errors */
    failed: SourceDocumentGroup[];
    /** Documents with all entries confirmed */
    completed: SourceDocumentGroup[];
}

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
function calculateTotalAmount(doc: RawSourceDocument): number {
    if (!doc.ledgerEntries?.length) return 0;
    return doc.ledgerEntries.reduce((sum, entry) => {
        const convertedAmount = entry.convertedAmount;
        const amount = convertedAmount
            ? parseFloat(convertedAmount)
            : parseFloat(String(entry.amount)) || 0;
        return sum + Math.abs(amount);
    }, 0);
}

/**
 * Helper to group source documents by status
 */
function groupByStatus(
    docs: RawSourceDocument[]
): GroupedSourceDocuments {
    const groups: GroupedSourceDocuments = {
        queued: [],
        processing: [],
        anomaly: [],
        failed: [],
        completed: [],
    };

    docs.forEach((doc) => {
        const group: SourceDocumentGroup = {
            sourceDocument: doc as unknown as SourceDocumentWithEntries,
            ledgerEntries: doc.ledgerEntries as unknown as SourceDocumentWithEntries['ledgerEntries'] || [],
        };

        switch (doc.status) {
            case 'queued':
                groups.queued.push(group);
                break;
            case 'processing':
            case 'parsing':
                groups.processing.push(group);
                break;
            case 'anomaly':
                groups.anomaly.push(group);
                break;
            case 'failed':
                groups.failed.push(group);
                break;
            case 'completed':
                groups.completed.push(group);
                break;
        }
    });

    return groups;
}

/**
 * Helper to filter and group source documents
 */
function filterAndGroup(
    docs: RawSourceDocument[],
    minAmount?: number,
    maxAmount?: number
): { groups: GroupedSourceDocuments; stats: SourceDocumentsStats } {
    // Apply amount filtering
    let filtered = docs;
    if (minAmount !== undefined || maxAmount !== undefined) {
        filtered = docs.filter(doc => {
            const total = calculateTotalAmount(doc);
            if (minAmount !== undefined && minAmount !== null && total < minAmount) return false;
            if (maxAmount !== undefined && maxAmount !== null && total > maxAmount) return false;
            return true;
        });
    }

    const groups = groupByStatus(filtered);

    return {
        groups,
        stats: {
            queuedCount: groups.queued.length,
            processingCount: groups.processing.length,
            anomalyCount: groups.anomaly.length,
            failedCount: groups.failed.length,
        },
    };
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

    const queryClient = useQueryClient();

    // Single query with flat cache structure
    // The 'all' key stores the raw flat array
    const { data: rawData, isLoading } = useSmartPolling({
        queryKey: queryKeys.sourceDocuments(ledgerId, 'all', startDate, endDate),
        queryFn: () => getAllSourceDocumentsAction(ledgerId, {
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
        }),
        isActive: (data) => {
            if (!data) return false;
            return data.some(doc =>
                doc.status === 'queued' ||
                doc.status === 'processing' ||
                doc.status === 'parsing'
            );
        },
        interval: 3000,
    });

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
                } as GroupedSourceDocuments,
                stats: {
                    queuedCount: 0,
                    processingCount: 0,
                    anomalyCount: 0,
                    failedCount: 0,
                } as SourceDocumentsStats,
            };
        }

        return filterAndGroup(rawData as unknown as RawSourceDocument[], minAmount, maxAmount);
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
