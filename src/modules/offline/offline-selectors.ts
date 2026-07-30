import Decimal from "decimal.js";
import type { EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

export interface OfflineDocumentMatch {
  document: SourceDocumentListItemDto;
  matchedEntries: SourceDocumentLedgerEntryDto[];
  displayEntries: SourceDocumentLedgerEntryDto[];
  subtotal: string;
  filteredSubtotal: boolean;
}

export function hasEntryFilters(filters: EntryFilters): boolean {
  return Boolean(
    (filters.search?.trim().length ?? 0) > 0 ||
    filters.categoryId ||
    filters.currency ||
    filters.minAmount != null ||
    filters.maxAmount != null
  );
}

function entryAmount(entry: SourceDocumentLedgerEntryDto): Decimal | null {
  try {
    return new Decimal(entry.convertedAmount ?? entry.amount);
  } catch {
    return null;
  }
}

export function matchesOfflineEntry(
  entry: SourceDocumentLedgerEntryDto,
  filters: EntryFilters
): boolean {
  const amount = entryAmount(entry);
  if (amount == null) return false;
  if (filters.minAmount != null && amount.lessThan(filters.minAmount)) return false;
  if (filters.maxAmount != null && amount.greaterThan(filters.maxAmount)) return false;
  if (filters.categoryId && entry.categoryId !== filters.categoryId) return false;
  if (filters.currency && entry.currency !== filters.currency) return false;
  const query = filters.search?.trim().toLocaleLowerCase();
  if (query) {
    const haystack = [entry.itemName, entry.description, entry.amount, entry.currency]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function selectOfflineDocuments(
  items: SourceDocumentListItemDto[],
  filters: EntryFilters
): OfflineDocumentMatch[] {
  const entryFiltered = hasEntryFilters(filters);
  const result: OfflineDocumentMatch[] = [];
  for (const document of items) {
    if (
      filters.startDate != null &&
      (document.entryDate == null || document.entryDate < filters.startDate)
    ) {
      continue;
    }
    if (
      filters.endDate != null &&
      (document.entryDate == null || document.entryDate > filters.endDate)
    ) {
      continue;
    }
    if ((filters.statuses?.length ?? 0) > 0 && !filters.statuses!.includes(document.status)) {
      continue;
    }
    const entries = document.ledgerEntries ?? [];
    const matchedEntries = entryFiltered
      ? entries.filter((entry) => matchesOfflineEntry(entry, filters))
      : entries;
    if (entryFiltered && matchedEntries.length === 0) continue;
    const subtotal = matchedEntries
      .reduce((total, entry) => total.plus(entryAmount(entry) ?? 0), new Decimal(0))
      .toFixed();
    result.push({
      document,
      matchedEntries,
      displayEntries: entryFiltered ? matchedEntries : entries,
      subtotal,
      filteredSubtotal: entryFiltered,
    });
  }
  return result;
}

export function totalOfflineMatches(matches: OfflineDocumentMatch[]): number {
  return matches
    .filter(({ document }) => document.status === "completed")
    .reduce((total, match) => total.plus(match.subtotal), new Decimal(0))
    .toNumber();
}
