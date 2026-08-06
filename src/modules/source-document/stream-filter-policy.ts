import { compare } from "@/lib/money/decimal";
import { normalizeSearchTerm } from "@/lib/search";
import type { SourceDocumentListItemDto } from "./contracts";

export interface StreamFilterPolicy {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  statuses?: readonly string[] | string | null;
  search?: string | null;
}

export function getStreamEffectiveDate(item: {
  entryDate?: string | null;
  createdAt: string;
}): string {
  if (item.entryDate != null && item.entryDate !== "") return item.entryDate;
  return item.createdAt.slice(0, 10);
}

function normalizedStatuses(statuses: StreamFilterPolicy["statuses"]): readonly string[] {
  if (typeof statuses !== "string") return statuses ?? [];
  if (statuses === "") return [];
  return statuses
    .split(",")
    .map((status: string) => status.trim())
    .filter(Boolean);
}

function normalizedSearch(search: StreamFilterPolicy["search"]): string | undefined {
  return normalizeSearchTerm(search);
}

export function hasStreamEntryFilters(filters: StreamFilterPolicy): boolean {
  return (
    filters.minAmount != null ||
    filters.maxAmount != null ||
    normalizedSearch(filters.search) !== undefined
  );
}

/**
 * SQL baseConditions() applies amount and search predicates to one EXISTS
 * subquery. Keep the same all-predicates-on-one-entry semantics on the client.
 */
export function matchesStreamEntry(
  entry: NonNullable<SourceDocumentListItemDto["ledgerEntries"]>[number],
  filters: Pick<StreamFilterPolicy, "minAmount" | "maxAmount" | "search">
): boolean {
  if (filters.minAmount != null || filters.maxAmount != null) {
    // The stream SQL only matches main-currency converted amounts; entries
    // without a conversion must never be treated as 1:1 matches.
    const amount = entry.convertedAmount;
    if (amount == null || amount === "") return false;
    try {
      if (filters.minAmount != null && compare(amount, String(filters.minAmount)) < 0) {
        return false;
      }
      if (filters.maxAmount != null && compare(amount, String(filters.maxAmount)) > 0) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const search = normalizedSearch(filters.search)?.toLocaleLowerCase();
  if (search == null) return true;
  return (
    entry.itemName.toLocaleLowerCase().includes(search) ||
    (entry.description?.toLocaleLowerCase().includes(search) ?? false)
  );
}

export function filterStreamEntries(
  entries: SourceDocumentListItemDto["ledgerEntries"] | undefined,
  filters: Pick<StreamFilterPolicy, "minAmount" | "maxAmount" | "search">
): NonNullable<SourceDocumentListItemDto["ledgerEntries"]> {
  const resolvedEntries = entries ?? [];
  if (!hasStreamEntryFilters(filters)) return resolvedEntries;
  return resolvedEntries.filter((entry) => matchesStreamEntry(entry, filters));
}

export function matchesStreamDocument(
  item: SourceDocumentListItemDto,
  filters: StreamFilterPolicy
): boolean {
  const statuses = normalizedStatuses(filters.statuses);
  if (statuses.length > 0 && !statuses.includes(item.status)) return false;

  const effectiveDate = getStreamEffectiveDate(item);
  if (filters.startDate != null && filters.startDate !== "" && effectiveDate < filters.startDate) {
    return false;
  }
  if (filters.endDate != null && filters.endDate !== "" && effectiveDate > filters.endDate) {
    return false;
  }

  if (!hasStreamEntryFilters(filters)) return true;
  return filterStreamEntries(item.ledgerEntries ?? [], filters).length > 0;
}

export function projectStreamDocument(
  item: SourceDocumentListItemDto,
  filters: StreamFilterPolicy
): SourceDocumentListItemDto {
  return {
    ...item,
    ledgerEntries: filterStreamEntries(item.ledgerEntries ?? [], filters),
  };
}
