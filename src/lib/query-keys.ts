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

    // === Ledger Entries ===
    ledgerEntries: (ledgerId: string, ...filters: (string | undefined)[]) =>
        ['ledgerEntries', ledgerId, ...filters.filter(Boolean)] as const,
    ledgerEntry: (id: string) => ['ledgerEntry', id] as const,

    // === Source Documents ===
    sourceDocuments: (ledgerId: string, ...filters: (string | undefined)[]) =>
        ['sourceDocuments', ledgerId, ...filters.filter(Boolean)] as const,
    sourceDocument: (id: string) => ['sourceDocument', id] as const,

    // === Categories ===
    entryCategories: (ledgerId: string) => ['entryCategories', ledgerId] as const,

    // === Summary & Stats ===
    summary: (ledgerId: string, ...params: (string | undefined)[]) =>
        ['summary', ledgerId, ...params.filter(Boolean)] as const,
    tokenStats: (ledgerId: string) => ['token-stats', ledgerId] as const,
    enhancedStats: (ledgerId: string) => ['enhanced-stats', ledgerId] as const,

    // === Currency ===
    convert: (amount: number, from: string, to: string, date?: string) =>
        ['convert', amount, from, to, date] as const,

    // === Tasks ===
    processingTasks: (ledgerId: string) => ['processingTasks', ledgerId] as const,
    taskQueue: (ledgerId: string) => ['taskQueue', ledgerId] as const,

    // === Service Credentials ===
    serviceCredentials: (ledgerId: string) => ['serviceCredentials', ledgerId] as const,
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
        // Invalidate any query that has ledgerId in position 0 or 1
        // This covers: ['ledger', ledgerId], ['ledgerEntries', ledgerId, ...], ['sourceDocuments', ledgerId, ...], etc.
        return Array.isArray(key) && (key[0] === ledgerId || key[1] === ledgerId);
    };
}
