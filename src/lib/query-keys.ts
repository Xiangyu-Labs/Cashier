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

  // === Ledger Entries ===
  ledgerEntries: (ledgerId: string, ...filters: (string | null | undefined)[]) =>
    ["ledgerEntries", ledgerId, ...filters.filter((v) => v !== undefined)] as const,
  ledgerEntry: (id: string) => ["ledgerEntry", id] as const,

  // === Source Documents ===
  sourceDocuments: (ledgerId: string, ...filters: (string | number | null | undefined)[]) =>
    ["sourceDocuments", ledgerId, ...filters.filter((v) => v !== undefined)] as const,
  sourceDocumentCounts: (ledgerId: string) => ["sourceDocuments", ledgerId, "counts"] as const,
  sourceDocumentEntities: (ledgerId: string) => ["sourceDocuments", ledgerId, "entities"] as const,
  sourceDocumentStream: (
    ledgerId: string,
    filters?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      minAmount?: number | null | undefined;
      maxAmount?: number | null | undefined;
      statuses?: string | null | undefined;
      search?: string | null | undefined;
    }
  ) =>
    [
      "sourceDocuments",
      ledgerId,
      "stream",
      filters?.startDate ?? null,
      filters?.endDate ?? null,
      filters?.minAmount ?? null,
      filters?.maxAmount ?? null,
      filters?.statuses ?? null,
      filters?.search ?? null,
    ] as const,
  sourceDocumentStreamPrefix: (ledgerId: string) =>
    ["sourceDocuments", ledgerId, "stream"] as const,
  sourceDocumentStreamTotal: (
    ledgerId: string,
    filters?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      minAmount?: number | null | undefined;
      maxAmount?: number | null | undefined;
      statuses?: string | null | undefined;
      search?: string | null | undefined;
    }
  ) =>
    [
      "sourceDocuments",
      ledgerId,
      "streamTotal",
      filters?.startDate ?? null,
      filters?.endDate ?? null,
      filters?.minAmount ?? null,
      filters?.maxAmount ?? null,
      filters?.statuses ?? null,
      filters?.search ?? null,
    ] as const,
  sourceDocument: (id: string) => ["sourceDocument", id] as const,
  sourceDocumentLight: (id: string) => ["sourceDocument", "light", id] as const,
  sourceDocumentFull: (ledgerId: string, id: string) =>
    ["sourceDocument", "full", ledgerId, id] as const,

  // === Categories ===
  entryCategories: (ledgerId: string) => ["entryCategories", ledgerId] as const,
  uncategorizedCount: (ledgerId: string) => ["uncategorizedCount", ledgerId] as const,
  ledgerSettings: (ledgerId: string) => ["ledgerSettings", ledgerId] as const,

  // === Summary & Stats ===
  summary: (ledgerId: string, ...params: (string | null | undefined)[]) =>
    ["summary", ledgerId, ...params.filter((v) => v !== undefined)] as const,
  tokenStats: (ledgerId: string) => ["token-stats", ledgerId] as const,
  enhancedStats: (
    ledgerId: string,
    params?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      compareStartDate?: string | null | undefined;
      compareEndDate?: string | null | undefined;
      rangeType?: string | null | undefined;
      mainCurrency?: string | null | undefined;
    }
  ) =>
    [
      "enhanced-stats",
      ledgerId,
      params?.startDate ?? null,
      params?.endDate ?? null,
      params?.compareStartDate ?? null,
      params?.compareEndDate ?? null,
      params?.rangeType ?? null,
      params?.mainCurrency ?? null,
    ] as const,

  // === Currency ===
  convert: (ledgerId: string, amount: number, from: string, to: string, date?: string) =>
    ["convert", ledgerId, amount, from, to, date] as const,
  batchConvert: (cacheKey: string, targetCurrency: string) =>
    ["batchConvert", cacheKey, targetCurrency] as const,

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

export function matchExactQueryKey(target: readonly unknown[]): QueryPredicate {
  return (query) =>
    Array.isArray(query.queryKey) &&
    query.queryKey.length === target.length &&
    target.every((value, index) => query.queryKey[index] === value);
}

export function invalidateEntryCategories(ledgerId: string): QueryPredicate {
  return matchExactQueryKey(queryKeys.entryCategories(ledgerId));
}

export function invalidateUncategorizedCount(ledgerId: string): QueryPredicate {
  return matchExactQueryKey(queryKeys.uncategorizedCount(ledgerId));
}

export function invalidateLedgerSettingsView(ledgerId: string): QueryPredicate {
  return matchExactQueryKey(queryKeys.ledgerSettings(ledgerId));
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
 * Helper to match all ledger entries queries for a ledger.
 */
export function matchLedgerEntries(ledgerId: string): QueryPredicate {
  return invalidateLedgerEntries(ledgerId);
}

/**
 * Helper to match the counts query for a ledger.
 */
export function invalidateSourceDocumentCounts(ledgerId: string): QueryPredicate {
  return matchExactQueryKey(queryKeys.sourceDocumentCounts(ledgerId));
}

/**
 * Helper to match all stream queries for a ledger.
 */
export function invalidateSourceDocumentStream(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.sourceDocumentStreamPrefix(ledgerId));
}

export function invalidateSourceDocumentStreamTotal(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(["sourceDocuments", ledgerId, "streamTotal"]);
}
