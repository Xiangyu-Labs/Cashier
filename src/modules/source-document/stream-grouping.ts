import type { SourceDocumentListItemDto, SourceDocumentLedgerEntryDto } from "./contracts";

/**
 * Stream grouping — pure presentation model that groups consecutive server-ordered
 * items into date-based headers with per-group totals.
 *
 * This module intentionally keeps no React, query, or mutation dependencies.
 * No filtering, deduplication, or sorting is performed — items arrive in canonical
 * server order and are grouped consecutively by effective date.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATE_UNKNOWN = "date_unknown";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function parseNumeric(amount: string | null | undefined): number {
  if (amount == null || amount === "") return 0;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : 0;
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
// Build
// ---------------------------------------------------------------------------

/**
 * Build stream groups from canonical server-ordered items.
 * Groups consecutive items by effective date without re-sorting.
 */
export function buildUnifiedStreamGroups(
  items: readonly SourceDocumentListItemDto[]
): UnifiedStreamGroup[] {
  // 1. Map to presentation items preserving server order
  const mapped: UnifiedStreamItem[] = items.map((item) => {
    const { date, provenance } = getEffectiveDate(item);
    return {
      sourceDocument: item,
      ledgerEntries: item.ledgerEntries ?? [],
      effectiveDate: date,
      dateProvenance: provenance,
    };
  });

  // 2. Group consecutive items by effective date (preserving order)
  const groups: UnifiedStreamGroup[] = [];
  for (const item of mapped) {
    const lastGroup = groups.at(-1);
    if (lastGroup != null && lastGroup.date === item.effectiveDate) {
      lastGroup.items.push(item);
    } else {
      groups.push({
        date: item.effectiveDate,
        dateProvenance: item.dateProvenance,
        total: 0,
        items: [item],
      });
    }
  }

  // 3. Compute totals (completed items only)
  for (const group of groups) {
    group.total = group.items.reduce((sum, item) => {
      if (item.sourceDocument.status === "completed") {
        return sum + computeEntryTotal(item.ledgerEntries);
      }
      return sum;
    }, 0);
  }

  return groups;
}
