/**
 * Centralized Query Key Factory
 *
 * All React Query keys should be defined here to ensure consistency
 * between data fetching (useQuery) and SSE cache invalidation (invalidation-hub).
 *
 * Usage:
 *   import { queryKeys } from '@/lib/query-keys';
 *   useQuery({ queryKey: queryKeys.ledgerEntries(ledgerId, 'pending'), ... })
 */

export const queryKeys = {
    // === Ledger ===
    ledger: (ledgerId: string) => ['ledger', ledgerId] as const,
    ledgers: () => ['ledgers'] as const,
    defaultLedgerId: () => ['defaultLedgerId'] as const,

    // === Ledger Entries ===
    ledgerEntries: (ledgerId: string, ...filters: (string | null | undefined)[]) =>
        ['ledgerEntries', ledgerId, ...filters.filter(v => v !== undefined)] as const,
    ledgerEntry: (id: string) => ['ledgerEntry', id] as const,

    // === Source Documents ===
    sourceDocuments: (ledgerId: string, ...filters: (string | number | null | undefined)[]) =>
        ['sourceDocuments', ledgerId, ...filters.filter(v => v !== undefined)] as const,
    sourceDocument: (id: string) => ['sourceDocument', id] as const,
    sourceDocumentLight: (id: string) => ['sourceDocument', 'light', id] as const,

    // === Categories ===
    entryCategories: (ledgerId: string) => ['entryCategories', ledgerId] as const,
    uncategorizedCount: (ledgerId: string) => ['uncategorizedCount', ledgerId] as const,
    ledgerSettings: (ledgerId: string) => ['ledgerSettings', ledgerId] as const,

    // === Summary & Stats ===
    summary: (ledgerId: string, ...params: (string | null | undefined)[]) =>
        ['summary', ledgerId, ...params.filter(v => v !== undefined)] as const,
    tokenStats: (ledgerId: string) => ['token-stats', ledgerId] as const,
    enhancedStats: (ledgerId: string) => ['enhanced-stats', ledgerId] as const,

    // === Currency ===
    convert: (amount: number, from: string, to: string, date?: string) =>
        ['convert', amount, from, to, date] as const,
    batchConvert: (cacheKey: string, targetCurrency: string) =>
        ['batchConvert', cacheKey, targetCurrency] as const,

    // === Tasks ===
    processingTasks: (ledgerId: string) => ['processingTasks', ledgerId] as const,
    taskQueue: (ledgerId: string) => ['taskQueue', ledgerId] as const,

    // === Service Credentials ===
    serviceCredentials: (ledgerId: string) => ['serviceCredentials', ledgerId] as const,

    // === Calendar ===
    calendarHeatmap: (
        ledgerId: string,
        viewType: string,
        anchorDate: string,
        filters?: { currency?: string; categoryId?: string }
    ) => ['calendar', 'heatmap', ledgerId, viewType, anchorDate, filters] as const,

    calendarHeatmapForRange: (
        ledgerId: string,
        startDate: string,
        endDate: string,
        filters?: { currency?: string; categoryId?: string }
    ) => ['calendar', 'heatmap-range', ledgerId, startDate, endDate, filters] as const,

    calendarDayDetail: (
        ledgerId: string,
        date: string,
        filters?: { currency?: string; categoryId?: string }
    ) => ['calendar', 'day', ledgerId, date, filters] as const,
} as const;

// Type helper for extracting query key type
export type QueryKeys = typeof queryKeys;

/**
 * Helper to create a predicate for invalidating all queries related to a ledger.
 * This ensures all ledger-related data is refreshed after mutations.
 *
 * Usage:
 *   queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
 */
export function invalidateLedgerCache(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        // Check if ledgerId exists anywhere in the query key array
        // This handles both standard keys (position 0 or 1) and calendar keys (position 2)
        return Array.isArray(key) && key.includes(ledgerId);
    };
}

/**
 * Helper to create a predicate for matching all source document queries for a ledger.
 * This matches queries regardless of date range filters.
 *
 * Usage:
 *   queryClient.setQueriesData({ predicate: matchSourceDocuments(ledgerId) }, updater)
 *   queryClient.invalidateQueries({ predicate: matchSourceDocuments(ledgerId) })
 */
export function matchSourceDocuments(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'sourceDocuments' &&
               key[1] === ledgerId;
    };
}

/**
 * Helper to create a predicate for matching paginated source document queries.
 * This matches only queries with 'all' filter (PaginatedSourceDocumentsResponse),
 * not 'pending' or other filters which have different response structures.
 *
 * Usage:
 *   queryClient.setQueriesData({ predicate: matchPaginatedSourceDocuments(ledgerId) }, updater)
 */
export function matchPaginatedSourceDocuments(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'sourceDocuments' &&
               key[1] === ledgerId &&
               key[2] === 'all';
    };
}

/**
 * Helper to create a predicate for matching all ledger entries queries for a ledger.
 * This matches queries regardless of filters.
 */
export function matchLedgerEntries(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'ledgerEntries' &&
               key[1] === ledgerId;
    };
}
