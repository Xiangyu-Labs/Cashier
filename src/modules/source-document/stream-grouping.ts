import type { SourceDocumentListItemDto, SourceDocumentLedgerEntryDto } from "./contracts";
import { add } from "@/lib/money/decimal";

/**
 * Stream grouping — pure presentation model that groups consecutive server-ordered
 * items into date-based headers with per-group totals.
 *
 * This module intentionally keeps no React, query, or mutation dependencies.
 * No filtering, deduplication, or sorting is performed — items arrive in canonical
 * server order and are grouped consecutively by effective date.
 */

export type DateProvenance = "transaction" | "submitted" | "unknown";

interface UnifiedStreamItem {
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
  /** Sum of active ledger-entry amounts across accounting-valid items in this group. */
  total: string;
  unconvertedCount: number;
  currencyTotals: Record<string, string>;
  items: UnifiedStreamItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATE_UNKNOWN = "date_unknown";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function addEntries(
  group: UnifiedStreamGroup,
  entries: SourceDocumentLedgerEntryDto[],
  mainCurrency?: string
): void {
  for (const entry of entries) {
    if (entry.convertedAmount != null && entry.convertedAmount !== "") {
      group.total = add(group.total, entry.convertedAmount);
      continue;
    }
    const currency = (entry.currency ?? mainCurrency)?.trim().toUpperCase();
    if (mainCurrency != null && currency === mainCurrency.trim().toUpperCase()) {
      group.total = add(group.total, entry.amount);
      continue;
    }
    group.unconvertedCount += 1;
    if (currency != null && currency !== "") {
      group.currencyTotals[currency] = add(group.currencyTotals[currency] ?? "0", entry.amount);
    }
  }
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
  items: readonly SourceDocumentListItemDto[],
  mainCurrency?: string
): UnifiedStreamGroup[] {
  const groups: UnifiedStreamGroup[] = [];
  for (const sourceDocument of items) {
    const entries = sourceDocument.ledgerEntries ?? [];
    const { date, provenance } = getEffectiveDate(sourceDocument);
    const item: UnifiedStreamItem = {
      sourceDocument,
      ledgerEntries: entries,
      effectiveDate: date,
      dateProvenance: provenance,
    };
    const lastGroup = groups.at(-1);
    let group: UnifiedStreamGroup;
    if (lastGroup != null && lastGroup.date === item.effectiveDate) {
      lastGroup.items.push(item);
      group = lastGroup;
    } else {
      group = {
        date: item.effectiveDate,
        dateProvenance: item.dateProvenance,
        total: "0",
        unconvertedCount: 0,
        currencyTotals: {},
        items: [item],
      };
      groups.push(group);
    }
    if (sourceDocument.status === "completed" || sourceDocument.status === "duplicate_pending") {
      addEntries(group, entries, mainCurrency);
    }
  }

  return groups;
}
