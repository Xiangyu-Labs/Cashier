import Decimal from "decimal.js";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import {
  effectiveDocumentDate,
  matchesLiteralEntrySearch,
} from "@/modules/ledger/entry-filter-semantics";
import type { EnhancedStatsDto, StatsComparisonMode } from "@/modules/stats/contracts";
import {
  buildEnhancedStatsDto,
  type EnhancedStatsBucket,
} from "@/modules/stats/application/build-enhanced-stats";

export interface CachedDocumentMatch {
  document: SourceDocumentListItemDto;
  matchedEntries: SourceDocumentLedgerEntryDto[];
  displayEntries: SourceDocumentLedgerEntryDto[];
  subtotal: string;
  unconvertedCount: number;
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
  if (entry.convertedAmount == null) return null;
  try {
    return new Decimal(entry.convertedAmount);
  } catch {
    return null;
  }
}

export function matchesCachedEntry(
  entry: SourceDocumentLedgerEntryDto,
  filters: EntryFilters
): boolean {
  const amount = entryAmount(entry);
  if (filters.minAmount != null && (amount == null || amount.lessThan(filters.minAmount))) {
    return false;
  }
  if (filters.maxAmount != null && (amount == null || amount.greaterThan(filters.maxAmount))) {
    return false;
  }
  if (filters.categoryId && entry.categoryId !== filters.categoryId) return false;
  if (filters.currency && entry.currency !== filters.currency) return false;
  if (!matchesLiteralEntrySearch(entry, filters.search)) return false;
  return true;
}

export function selectCachedDocuments(
  items: SourceDocumentListItemDto[],
  filters: EntryFilters
): CachedDocumentMatch[] {
  const entryFiltered = hasEntryFilters(filters);
  const result: CachedDocumentMatch[] = [];
  for (const document of items) {
    const effectiveDate = effectiveDocumentDate(document);
    if (filters.startDate != null && effectiveDate < filters.startDate) {
      continue;
    }
    if (filters.endDate != null && effectiveDate > filters.endDate) {
      continue;
    }
    if ((filters.statuses?.length ?? 0) > 0 && !filters.statuses!.includes(document.status)) {
      continue;
    }
    const entries = document.ledgerEntries ?? [];
    const matchedEntries = entryFiltered
      ? entries.filter((entry) => matchesCachedEntry(entry, filters))
      : entries;
    if (entryFiltered && matchedEntries.length === 0) continue;
    const subtotal = matchedEntries
      .reduce((total, entry) => total.plus(entryAmount(entry) ?? 0), new Decimal(0))
      .toFixed();
    const unconvertedCount = matchedEntries.filter((entry) => entry.convertedAmount == null).length;
    result.push({
      document,
      matchedEntries,
      displayEntries: entryFiltered ? matchedEntries : entries,
      subtotal,
      unconvertedCount,
      filteredSubtotal: entryFiltered,
    });
  }
  return result;
}

export function totalCachedMatches(matches: CachedDocumentMatch[]): number {
  return matches
    .filter(
      ({ document }) => document.status === "completed" || document.status === "duplicate_pending"
    )
    .reduce((total, match) => total.plus(match.subtotal), new Decimal(0))
    .toNumber();
}

export function totalCachedUnconvertedMatches(matches: CachedDocumentMatch[]): number {
  return matches
    .filter(
      ({ document }) => document.status === "completed" || document.status === "duplicate_pending"
    )
    .reduce((total, match) => total + match.unconvertedCount, 0);
}

interface CachedStatsRange {
  from: string;
  to: string;
}

interface CachedStatsBucket extends EnhancedStatsBucket {
  unconvertedCount: number;
}

function buildCachedStatsBucket(
  items: readonly SourceDocumentListItemDto[],
  range: CachedStatsRange,
  mainCurrency: string,
  uncategorizedLabel: string
): CachedStatsBucket {
  const bucket: CachedStatsBucket = {
    total: new Decimal(0),
    unconvertedCount: 0,
    categories: new Map(),
    days: new Map(),
  };

  for (const document of items) {
    const date = effectiveDocumentDate(document);
    if (date < range.from || date > range.to) continue;

    for (const entry of document.ledgerEntries ?? []) {
      const amount = entryAmount(entry);
      if (amount == null) {
        bucket.unconvertedCount += 1;
        continue;
      }
      bucket.total = bucket.total.plus(amount);

      const categoryKey = entry.categoryId ?? "uncategorized";
      const category = bucket.categories.get(categoryKey) ?? {
        id: entry.categoryId,
        name: entry.category?.name ?? uncategorizedLabel,
        icon: entry.category?.icon ?? null,
        total: new Decimal(0),
        count: 0,
      };
      category.total = category.total.plus(amount);
      category.count += 1;
      bucket.categories.set(categoryKey, category);

      const day = bucket.days.get(date) ?? {
        total: new Decimal(0),
        count: 0,
        currencies: new Set<string>(),
      };
      day.total = day.total.plus(amount);
      day.count += 1;
      day.currencies.add(entry.currency ?? mainCurrency);
      bucket.days.set(date, day);
    }
  }
  return bucket;
}

export function buildCachedEnhancedStats({
  items,
  queryRange,
  compareRange,
  mainCurrency,
  uncategorizedLabel,
  comparisonMode,
}: {
  items: readonly SourceDocumentListItemDto[];
  queryRange: CachedStatsRange;
  compareRange: CachedStatsRange;
  mainCurrency: string;
  uncategorizedLabel: string;
  comparisonMode?: StatsComparisonMode;
}): EnhancedStatsDto {
  const current = buildCachedStatsBucket(items, queryRange, mainCurrency, uncategorizedLabel);
  const previous = buildCachedStatsBucket(items, compareRange, mainCurrency, uncategorizedLabel);
  return buildEnhancedStatsDto({
    unconvertedCount: current.unconvertedCount,
    mainCurrency,
    current,
    previous,
    queryRange,
    compareRange,
    comparisonMode,
  });
}
