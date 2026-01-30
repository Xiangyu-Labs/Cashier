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

    // === Source Documents ===
    sourceDocuments: (ledgerId: string, ...filters: (string | undefined)[]) =>
        ['sourceDocuments', ledgerId, ...filters.filter(Boolean)] as const,

    // === Categories ===
    entryCategories: (ledgerId: string) => ['entryCategories', ledgerId] as const,

    // === Summary & Stats ===
    summary: (ledgerId: string, ...params: (string | undefined)[]) =>
        ['summary', ledgerId, ...params.filter(Boolean)] as const,
    tokenStats: (ledgerId: string) => ['token-stats', ledgerId] as const,

    // === Tasks ===
    processingTasks: (ledgerId: string) => ['processingTasks', ledgerId] as const,

    // === Service Credentials ===
    serviceCredentials: (ledgerId: string) => ['serviceCredentials', ledgerId] as const,
} as const;

// Type helper for extracting query key type
export type QueryKeys = typeof queryKeys;
