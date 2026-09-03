/**
 * Centralized Query Key Factory
 *
 * All React Query keys should be defined here to ensure consistency
 * between data fetching (useQuery) and SSE cache invalidation (invalidation-hub).
 *
 * Usage:
 *   import { queryKeys } from '@/lib/query-keys';
 *   useQuery({ queryKey: queryKeys.ledgerEntries(ledgerId, { status: 'pending' }), ... })
 */

export const queryKeys = {
  // === Ledger ===
  ledger: (ledgerId: string) => ["ledger", ledgerId] as const,
  ledgers: () => ["ledgers"] as const,

  // === Ledger Entries ===
  ledgerEntries: (ledgerId: string, params?: QueryKeyParams | null) =>
    ["ledgerEntries", ledgerId, normalizeQueryParams(params)] as const,
  ledgerEntry: (ledgerId: string, entryId: string) =>
    ["ledger", ledgerId, "entry", entryId] as const,

  // === Source Documents ===
  sourceDocuments: (ledgerId: string, params?: QueryKeyParams | null) =>
    ["sourceDocuments", ledgerId, normalizeQueryParams(params)] as const,
  sourceDocumentStream: (
    ledgerId: string,
    filters?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      minAmount?: string | null | undefined;
      maxAmount?: string | null | undefined;
      statuses?: string | null | undefined;
      search?: string | null | undefined;
    }
  ) => ["sourceDocuments", ledgerId, "stream", normalizeQueryParams(filters)] as const,
  sourceDocumentStreamPrefix: (ledgerId: string) =>
    ["sourceDocuments", ledgerId, "stream"] as const,
  sourceDocumentStreamTotal: (
    ledgerId: string,
    filters?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      minAmount?: string | null | undefined;
      maxAmount?: string | null | undefined;
      statuses?: string | null | undefined;
      search?: string | null | undefined;
    }
  ) => ["sourceDocuments", ledgerId, "streamTotal", normalizeQueryParams(filters)] as const,
  sourceDocument: (ledgerId: string, documentId: string) =>
    ["ledger", ledgerId, "source-document", documentId, "detail"] as const,
  sourceDocumentLight: (ledgerId: string, documentId: string) =>
    ["ledger", ledgerId, "source-document", documentId, "light"] as const,
  sourceDocumentCandidateReview: (ledgerId: string, id: string) =>
    ["ledger", ledgerId, "source-document", id, "review", "candidate"] as const,
  sourceDocumentDuplicateReview: (ledgerId: string, id: string) =>
    ["ledger", ledgerId, "source-document", id, "review", "duplicate"] as const,
  sourceDocumentFull: (ledgerId: string, id: string) =>
    ["ledger", ledgerId, "source-document", id, "full"] as const,
  sourceDocumentRefresh: (ledgerId: string) => ["sourceDocumentRefresh", ledgerId] as const,

  // === Categories ===
  entryCategories: (ledgerId: string) => ["entryCategories", ledgerId] as const,
  ledgerSettings: (ledgerId: string) => ["ledgerSettings", ledgerId] as const,

  // === Summary & Stats ===
  summary: (ledgerId: string, params?: QueryKeyParams | null) =>
    ["summary", ledgerId, normalizeQueryParams(params)] as const,
  tokenStats: (ledgerId: string) => ["token-stats", ledgerId] as const,
  enhancedStats: (
    ledgerId: string,
    params?: {
      startDate?: string | null | undefined;
      endDate?: string | null | undefined;
      compareStartDate?: string | null | undefined;
      compareEndDate?: string | null | undefined;
      rangeType?: string | null | undefined;
      comparisonMode?: string | null | undefined;
      mainCurrency?: string | null | undefined;
    }
  ) => ["enhanced-stats", ledgerId, normalizeQueryParams(params)] as const,

  // === Currency ===
  convert: (ledgerId: string, amount: string, from: string, to: string, date: string) =>
    ["convert", ledgerId, amount, from, to, date] as const,
  batchConvert: (cacheKey: string, targetCurrency: string) =>
    ["batchConvert", cacheKey, targetCurrency] as const,

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

type QueryKeyParams = Readonly<Record<string, unknown>>;

function normalizeQueryParams(params?: QueryKeyParams | null): Readonly<Record<string, unknown>> {
  if (params == null) return {};
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, value === undefined ? null : value])
  );
}

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
  return createPrefixPredicate(["ledgerEntries", ledgerId]);
}

export function invalidateLedgerEntryDetails(ledgerId: string): QueryPredicate {
  return (query) => {
    const key = query.queryKey;
    return Array.isArray(key) && key[0] === "ledger" && key[1] === ledgerId && key[2] === "entry";
  };
}

/**
 * Helper to match all source document queries for a ledger.
 */
export function invalidateSourceDocuments(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(["sourceDocuments", ledgerId]);
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
        (key[0] === "entryCategories" && key[1] === ledgerId))
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
 * Helper to match all stream queries for a ledger.
 */
export function invalidateSourceDocumentStream(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(queryKeys.sourceDocumentStreamPrefix(ledgerId));
}

export function invalidateSourceDocumentStreamTotal(ledgerId: string): QueryPredicate {
  return createPrefixPredicate(["sourceDocuments", ledgerId, "streamTotal"]);
}
