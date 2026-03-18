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
  ledger: (ledgerId: string) => ["ledger", ledgerId] as const,
  ledgers: () => ["ledgers"] as const,
  defaultLedgerId: () => ["defaultLedgerId"] as const,

  // === Ledger Entries ===
  ledgerEntries: (ledgerId: string, ...filters: (string | null | undefined)[]) =>
    ["ledgerEntries", ledgerId, ...filters.filter((v) => v !== undefined)] as const,
  ledgerEntry: (id: string) => ["ledgerEntry", id] as const,

  // === Source Documents ===
  sourceDocuments: (ledgerId: string, ...filters: (string | number | null | undefined)[]) =>
    ["sourceDocuments", ledgerId, ...filters.filter((v) => v !== undefined)] as const,
  sourceDocument: (id: string) => ["sourceDocument", id] as const,
  sourceDocumentLight: (id: string) => ["sourceDocument", "light", id] as const,

  // === Categories ===
  entryCategories: (ledgerId: string) => ["entryCategories", ledgerId] as const,
  uncategorizedCount: (ledgerId: string) => ["uncategorizedCount", ledgerId] as const,
  ledgerSettings: (ledgerId: string) => ["ledgerSettings", ledgerId] as const,

  // === Summary & Stats ===
  summary: (ledgerId: string, ...params: (string | null | undefined)[]) =>
    ["summary", ledgerId, ...params.filter((v) => v !== undefined)] as const,
  tokenStats: (ledgerId: string) => ["token-stats", ledgerId] as const,
  enhancedStats: (ledgerId: string) => ["enhanced-stats", ledgerId] as const,

  // === Currency ===
  convert: (amount: number, from: string, to: string, date?: string) =>
    ["convert", amount, from, to, date] as const,
  batchConvert: (cacheKey: string, targetCurrency: string) =>
    ["batchConvert", cacheKey, targetCurrency] as const,

  // === Tasks ===
  processingTasks: (ledgerId: string) => ["processingTasks", ledgerId] as const,
  taskQueue: (ledgerId: string) => ["taskQueue", ledgerId] as const,

  // === Service Credentials ===
  serviceCredentials: (ledgerId: string) => ["serviceCredentials", ledgerId] as const,

  // === Calendar ===
  calendarHeatmap: (
    ledgerId: string,
    viewType: string,
    anchorDate: string,
    filters?: { currency?: string; categoryId?: string }
  ) => ["calendar", "heatmap", ledgerId, viewType, anchorDate, filters] as const,

  calendarHeatmapForRange: (
    ledgerId: string,
    startDate: string,
    endDate: string,
    filters?: { currency?: string; categoryId?: string }
  ) => ["calendar", "heatmap-range", ledgerId, startDate, endDate, filters] as const,

  calendarDayDetail: (
    ledgerId: string,
    date: string,
    filters?: { currency?: string; categoryId?: string }
  ) => ["calendar", "day", ledgerId, date, filters] as const,
} as const;

// Type helper for extracting query key type
export type QueryKeys = typeof queryKeys;

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

function isQueryKeyPrefixMatch(queryKey: readonly unknown[], prefix: readonly unknown[]) {
  return prefix.every((value, index) => queryKey[index] === value);
}

function createPrefixPredicate(prefix: readonly unknown[]): QueryPredicate {
  return (query) => Array.isArray(query.queryKey) && isQueryKeyPrefixMatch(query.queryKey, prefix);
}

/**
 * Helper to match ledger resource queries for a specific ledger.
 */
export function invalidateLedger(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.ledger(ledgerId));
}

/**
 * Helper to match all ledger entries list queries for a ledger.
 */
export function invalidateLedgerEntries(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.ledgerEntries(ledgerId));
}

/**
 * Helper to match all source document queries for a ledger.
 */
export function invalidateSourceDocuments(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.sourceDocuments(ledgerId));
}

/**
 * Helper to match stats and summary queries for a ledger.
 */
export function invalidateLedgerStats(ledgerId: string): QueryPredicate {
  return (query) => {
    const key = query.queryKey;
    return (
      Array.isArray(key) &&
      ((key[0] === "summary" && key[1] === ledgerId) ||
        (key[0] === "enhanced-stats" && key[1] === ledgerId))
    );
  };
}

/**
 * Helper to match ledger settings queries for a ledger.
 */
export function invalidateLedgerSettings(ledgerId: string): QueryPredicate {
  return (query) => {
    const key = query.queryKey;
    return (
      Array.isArray(key) &&
      ((key[0] === "ledgerSettings" && key[1] === ledgerId) ||
        (key[0] === "entryCategories" && key[1] === ledgerId) ||
        (key[0] === "uncategorizedCount" && key[1] === ledgerId) ||
        (key[0] === "serviceCredentials" && key[1] === ledgerId))
    );
  };
}

/**
 * Helper to match calendar queries for a ledger.
 */
export function invalidateCalendar(ledgerId: string): QueryPredicate {
  return (query) => {
    const key = query.queryKey;
    return Array.isArray(key) && key[0] === "calendar" && key[2] === ledgerId;
  };
}

/**
 * Helper to match task queue / processing task queries for a ledger.
 */
export function invalidateTaskQueue(ledgerId: string): QueryPredicate {
  return (query) => {
    const key = query.queryKey;
    return (
      Array.isArray(key) &&
      ((key[0] === "taskQueue" && key[1] === ledgerId) ||
        (key[0] === "processingTasks" && key[1] === ledgerId))
    );
  };
}

/**
 * Helper to match paginated source document queries with the `all` filter.
 */
export function matchPaginatedSourceDocuments(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.sourceDocuments(ledgerId, "all"));
}

/**
 * Helper to match all ledger entries queries for a ledger.
 */
export function matchLedgerEntries(ledgerId: string): QueryPredicate {
  return invalidateLedgerEntries(ledgerId);
}
