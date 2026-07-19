import type {
  SourceDocumentListItemDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentStatusType,
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
  /** Selected source-document statuses. Empty/undefined accepts every known status. */
  statuses?: SourceDocumentStatusType[];
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
// Strict filter predicate
// ---------------------------------------------------------------------------

/** Returns `true` when the item passes all active date, amount, and status filters. */
function passesFilter(
  item: SourceDocumentListItemDto,
  filters: StreamGroupingFilters
): boolean {
  // Date filter — unknown dates fail an active date range
  const { date } = getEffectiveDate(item);
  if (date === DATE_UNKNOWN) {
    if (
      (filters.startDate != null && filters.startDate !== "") ||
      (filters.endDate != null && filters.endDate !== "")
    ) {
      return false;
    }
  } else {
    if (
      filters.startDate != null &&
      filters.startDate !== "" &&
      date < filters.startDate
    )
      return false;
    if (
      filters.endDate != null &&
      filters.endDate !== "" &&
      date > filters.endDate
    )
      return false;
  }

  // Amount filter — uses candidate active total for non-completed items
  const total = computeActiveTotal(item);
  if (filters.minAmount != null && total < filters.minAmount) return false;
  if (filters.maxAmount != null && total > filters.maxAmount) return false;

  // Status filter — empty/undefined means "all statuses"
  if (filters.statuses != null && filters.statuses.length > 0) {
    if (!(filters.statuses as readonly string[]).includes(item.status)) {
      return false;
    }
  }

  return true;
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

  // 2. Apply strict predicate to both attention and completed after dedup
  const filteredAttention = attentionItems.filter((item) =>
    passesFilter(item, filters)
  );
  const filteredCompleted = dedupedCompleted.filter((item) =>
    passesFilter(item, filters)
  );

  // 3. Map to presentation items
  const allItems: UnifiedStreamItem[] = [
    ...filteredAttention.map((item) => {
      const { date, provenance } = getEffectiveDate(item);
      return {
        sourceDocument: item,
        ledgerEntries: item.ledgerEntries ?? [],
        effectiveDate: date,
        dateProvenance: provenance,
      };
    }),
    ...filteredCompleted.map((item) => {
      const { date, provenance } = getEffectiveDate(item);
      return {
        sourceDocument: item,
        ledgerEntries: item.ledgerEntries ?? [],
        effectiveDate: date,
        dateProvenance: provenance,
      };
    }),
  ];

  // 4. Group by effective date
  const groupMap = new Map<string, UnifiedStreamItem[]>();
  for (const item of allItems) {
    const group = groupMap.get(item.effectiveDate) ?? [];
    group.push(item);
    groupMap.set(item.effectiveDate, group);
  }

  // 5. Sort items within each group by createdAt descending, id descending, then status priority
  for (const [, items] of groupMap) {
    items.sort((a, b) => {
      if (a.sourceDocument.createdAt !== b.sourceDocument.createdAt) {
        return b.sourceDocument.createdAt.localeCompare(
          a.sourceDocument.createdAt
        );
      }
      if (a.sourceDocument.id !== b.sourceDocument.id) {
        return b.sourceDocument.id.localeCompare(a.sourceDocument.id);
      }
      const pa =
        STATUS_PRIORITY[a.sourceDocument.status] ?? FALLBACK_PRIORITY;
      const pb =
        STATUS_PRIORITY[b.sourceDocument.status] ?? FALLBACK_PRIORITY;
      return pa - pb;
    });
  }

  // 6. Sort groups: known dates descending, unknown last
  const sortedDates = [...groupMap.keys()].sort((a, b) => {
    if (a === DATE_UNKNOWN) return 1;
    if (b === DATE_UNKNOWN) return -1;
    return b.localeCompare(a);
  });

  // 7. Build group objects with active-only totals
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
