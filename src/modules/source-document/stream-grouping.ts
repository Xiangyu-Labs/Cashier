import type {
  SourceDocumentListItemDto,
  SourceDocumentLedgerEntryDto,
} from "./contracts";

/**
 * Stream grouping — pure presentation model that merges attention and
 * completed collections into one chronological, state-ordered card sequence.
 *
 * This module intentionally keeps no React, query, or mutation dependencies.
 */

export type DateProvenance = "transaction" | "submitted" | "unknown";

export interface UnifiedStreamItem {
  sourceDocument: SourceDocumentListItemDto;
  ledgerEntries: SourceDocumentLedgerEntryDto[];
  /** Effective group date in yyyy-MM-dd, or the sentinel "date_unknown". */
  effectiveDate: string;
  /** Where `effectiveDate` came from — the UI must use this to label the date. */
  dateProvenance: DateProvenance;
  /** `true` only for attention items excluded by the active date or amount filter. */
  outsideCurrentFilter: boolean;
}

export interface UnifiedStreamGroup {
  /** Effective date key shared by items in this group. */
  date: string;
  /** Provenance of the first item's effective date (groups are homogeneous). */
  dateProvenance: DateProvenance;
  /** Sum of active ledger-entry amounts across completed items in this group. */
  total: number;
  items: UnifiedStreamItem[];
}

export interface StreamGroupingFilters {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATE_UNKNOWN = "date_unknown";

const STATUS_PRIORITY: Readonly<Record<string, number>> = {
  candidate_pending: 1,
  anomaly: 2,
  failed: 3,
  processing: 4,
  queued: 5,
  completed: 6,
};

const FALLBACK_PRIORITY = 99;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function parseNumeric(amount: string | null | undefined): number {
  if (amount == null || amount === "") return 0;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeActiveTotal(item: SourceDocumentListItemDto): number {
  if (item.status === "completed" && item.ledgerEntries != null) {
    return item.ledgerEntries.reduce((sum, e) => {
      const amt =
        e.convertedAmount != null && e.convertedAmount !== ""
          ? parseNumeric(e.convertedAmount)
          : parseNumeric(e.amount);
      return sum + amt;
    }, 0);
  }
  if (item.status === "candidate_pending" && item.candidateComparison != null) {
    return parseNumeric(item.candidateComparison.active.total);
  }
  return 0;
}

function computeEntryTotal(entries: SourceDocumentLedgerEntryDto[]): number {
  return entries.reduce((sum, e) => {
    const amt =
      e.convertedAmount != null && e.convertedAmount !== ""
        ? parseNumeric(e.convertedAmount)
        : parseNumeric(e.amount);
    return sum + amt;
  }, 0);
}

// ---------------------------------------------------------------------------
// Effective date
// ---------------------------------------------------------------------------

/** Derive the date a card groups under. Never invents the current date. */
export function getEffectiveDate(sourceDocument: {
  entryDate?: string | null;
  createdAt?: string;
}): { date: string; provenance: DateProvenance } {
  if (sourceDocument.entryDate != null && sourceDocument.entryDate.trim() !== "") {
    return { date: sourceDocument.entryDate, provenance: "transaction" };
  }
  const createdAt = sourceDocument.createdAt;
  if (createdAt != null && createdAt !== "") {
    const date = createdAt.slice(0, 10);
    if (date.length === 10) {
      return { date, provenance: "submitted" };
    }
  }
  return { date: DATE_UNKNOWN, provenance: "unknown" };
}

// ---------------------------------------------------------------------------
// Filter exceptions
// ---------------------------------------------------------------------------

function isOutsideDateFilter(
  item: SourceDocumentListItemDto,
  filters: StreamGroupingFilters
): boolean {
  if (filters.startDate == null && filters.endDate == null) return false;
  const { date } = getEffectiveDate(item);
  if (date === DATE_UNKNOWN) return false;
  if (
    filters.startDate != null &&
    filters.startDate !== "" &&
    date < filters.startDate
  )
    return true;
  if (
    filters.endDate != null &&
    filters.endDate !== "" &&
    date > filters.endDate
  )
    return true;
  return false;
}

function isOutsideAmountFilter(
  item: SourceDocumentListItemDto,
  filters: StreamGroupingFilters
): boolean {
  if (filters.minAmount == null && filters.maxAmount == null) return false;
  const total = computeActiveTotal(item);
  if (filters.minAmount != null && total < filters.minAmount) return true;
  if (filters.maxAmount != null && total > filters.maxAmount) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildUnifiedStreamGroups(
  attentionItems: readonly SourceDocumentListItemDto[],
  completedItems: readonly SourceDocumentListItemDto[],
  filters: StreamGroupingFilters = {}
): UnifiedStreamGroup[] {
  // 1. Deduplicate — attention version wins
  const attentionIds = new Set(attentionItems.map((item) => item.id));
  const dedupedCompleted = completedItems.filter(
    (item) => !attentionIds.has(item.id)
  );

  // 2. Map to presentation items
  const allItems: UnifiedStreamItem[] = [
    ...attentionItems.map((item) => {
      const { date, provenance } = getEffectiveDate(item);
      const outsideFilter =
        isOutsideDateFilter(item, filters) ||
        isOutsideAmountFilter(item, filters);
      return {
        sourceDocument: item,
        ledgerEntries: item.ledgerEntries ?? [],
        effectiveDate: date,
        dateProvenance: provenance,
        outsideCurrentFilter: outsideFilter,
      };
    }),
    ...dedupedCompleted.map((item) => {
      const { date, provenance } = getEffectiveDate(item);
      return {
        sourceDocument: item,
        ledgerEntries: item.ledgerEntries ?? [],
        effectiveDate: date,
        dateProvenance: provenance,
        outsideCurrentFilter: false,
      };
    }),
  ];

  // 3. Group by effective date
  const groupMap = new Map<string, UnifiedStreamItem[]>();
  for (const item of allItems) {
    const group = groupMap.get(item.effectiveDate) ?? [];
    group.push(item);
    groupMap.set(item.effectiveDate, group);
  }

  // 4. Sort items within each group by status priority, then createdAt, then id
  for (const [, items] of groupMap) {
    items.sort((a, b) => {
      const pa =
        STATUS_PRIORITY[a.sourceDocument.status] ?? FALLBACK_PRIORITY;
      const pb =
        STATUS_PRIORITY[b.sourceDocument.status] ?? FALLBACK_PRIORITY;
      if (pa !== pb) return pa - pb;
      if (a.sourceDocument.createdAt !== b.sourceDocument.createdAt) {
        return a.sourceDocument.createdAt.localeCompare(
          b.sourceDocument.createdAt
        );
      }
      return a.sourceDocument.id.localeCompare(b.sourceDocument.id);
    });
  }

  // 5. Sort groups: known dates descending, unknown last
  const sortedDates = [...groupMap.keys()].sort((a, b) => {
    if (a === DATE_UNKNOWN) return 1;
    if (b === DATE_UNKNOWN) return -1;
    return b.localeCompare(a);
  });

  // 6. Build group objects with active-only totals
  return sortedDates.map((date) => {
    const items = groupMap.get(date)!;
    const provenance = items[0]?.dateProvenance ?? "unknown";
    const total = items.reduce((sum, item) => {
      if (item.sourceDocument.status === "completed") {
        return sum + computeEntryTotal(item.ledgerEntries);
      }
      return sum;
    }, 0);
    return { date, dateProvenance: provenance, total, items };
  });
}
