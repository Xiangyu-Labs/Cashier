import Decimal from "decimal.js";
import type { EntryFilters } from "@/modules/ledger/ui";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import {
  effectiveDocumentDate,
  matchesLiteralEntrySearch,
} from "@/modules/ledger/entry-filter-semantics";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";
import { calculateGrowth } from "@/modules/stats/utils";

export interface CachedDocumentMatch {
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

export function matchesCachedEntry(
  entry: SourceDocumentLedgerEntryDto,
  filters: EntryFilters
): boolean {
  const amount = entryAmount(entry);
  if (amount == null) return false;
  if (filters.minAmount != null && amount.lessThan(filters.minAmount)) return false;
  if (filters.maxAmount != null && amount.greaterThan(filters.maxAmount)) return false;
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

export function totalCachedMatches(matches: CachedDocumentMatch[]): number {
  return matches
    .filter(({ document }) => document.status === "completed")
    .reduce((total, match) => total.plus(match.subtotal), new Decimal(0))
    .toNumber();
}

interface CachedStatsRange {
  from: string;
  to: string;
}

interface CachedStatsBucket {
  total: Decimal;
  categories: Map<
    string,
    {
      id: string | null;
      name: string;
      icon: string | null;
      total: Decimal;
      count: number;
    }
  >;
  days: Map<string, { total: Decimal; count: number; currencies: Set<string> }>;
}

function buildCachedStatsBucket(
  items: readonly SourceDocumentListItemDto[],
  range: CachedStatsRange,
  mainCurrency: string,
  uncategorizedLabel: string
): CachedStatsBucket {
  const bucket: CachedStatsBucket = {
    total: new Decimal(0),
    categories: new Map(),
    days: new Map(),
  };

  for (const document of items) {
    if (document.status !== "completed") continue;
    const date = effectiveDocumentDate(document);
    if (date < range.from || date > range.to) continue;

    for (const entry of document.ledgerEntries ?? []) {
      const amount = entryAmount(entry);
      if (amount == null) continue;
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

function calculateHeatmapStats(amounts: number[]) {
  if (amounts.length === 0) {
    return { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 };
  }
  const sorted = amounts.toSorted((left, right) => left - right);
  const minAmount = sorted[0] ?? 0;
  const maxAmount = sorted.at(-1) ?? minAmount;
  return {
    minAmount,
    maxAmount,
    avgAmount: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
    p80Amount: sorted[Math.max(0, Math.ceil(sorted.length * 0.8) - 1)] ?? maxAmount,
  };
}

export function buildCachedEnhancedStats({
  items,
  queryRange,
  compareRange,
  mainCurrency,
  uncategorizedLabel,
  today,
}: {
  items: readonly SourceDocumentListItemDto[];
  queryRange: CachedStatsRange;
  compareRange: CachedStatsRange;
  mainCurrency: string;
  uncategorizedLabel: string;
  today: string;
}): EnhancedStatsDto {
  const current = buildCachedStatsBucket(items, queryRange, mainCurrency, uncategorizedLabel);
  const previous = buildCachedStatsBucket(items, compareRange, mainCurrency, uncategorizedLabel);
  const total = current.total.toNumber();
  const previousTotal = previous.total.toNumber();
  const totalGrowth = calculateGrowth(total, previousTotal);
  const categories = [...current.categories.entries()]
    .map(([key, category]) => {
      const previousAmount = previous.categories.get(key)?.total.toNumber() ?? 0;
      const growth = calculateGrowth(category.total.toNumber(), previousAmount);
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        totalOriginal: "0",
        totalConverted: category.total.toFixed(),
        currency: mainCurrency,
        percent: current.total.isZero()
          ? 0
          : category.total.div(current.total).times(100).toNumber(),
        count: category.count,
        trend: { percent: growth.percent, amount: String(growth.amount) },
      };
    })
    .toSorted((left, right) => Number(right.totalConverted) - Number(left.totalConverted));
  const heatmapDays = [...current.days.entries()]
    .map(([date, day]) => ({
      date,
      totalAmount: day.total.toNumber(),
      entryCount: day.count,
      currencies: [...day.currencies],
    }))
    .toSorted((left, right) => left.date.localeCompare(right.date));
  const effectiveEnd = queryRange.to < today ? queryRange.to : today;
  const startTime = Date.parse(`${queryRange.from}T00:00:00Z`);
  const endTime = Date.parse(`${effectiveEnd}T00:00:00Z`);
  const days = endTime >= startTime ? Math.round((endTime - startTime) / 86_400_000) + 1 : 0;

  return {
    summary: {
      total: current.total.toFixed(),
      currency: mainCurrency,
      trend: { percent: totalGrowth.percent, amount: String(totalGrowth.amount) },
      dailyAverage: days > 0 ? total / days : 0,
    },
    categories,
    chart: heatmapDays.map(({ date, totalAmount }) => ({ date, total: totalAmount })),
    heatmap: {
      days: heatmapDays,
      stats: calculateHeatmapStats(heatmapDays.map((day) => day.totalAmount)),
    },
  };
}
