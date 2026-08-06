import Decimal from "decimal.js";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";
import type { EnhancedStatsDto, StatsComparisonMode } from "@/modules/stats/contracts";

export interface EnhancedStatsBucketCategory {
  id: string | null;
  name: string;
  icon: string | null;
  total: Decimal;
  count: number;
}

export interface EnhancedStatsBucketDay {
  total: Decimal;
  count: number;
  currencies: Set<string>;
}

export interface EnhancedStatsBucket {
  total: Decimal;
  categories: Map<string, EnhancedStatsBucketCategory>;
  days: Map<string, EnhancedStatsBucketDay>;
}

export interface BuildEnhancedStatsDtoInput {
  mainCurrency: string;
  unconvertedCount: number;
  current: EnhancedStatsBucket;
  previous: EnhancedStatsBucket;
  queryRange: { from: string; to: string };
  compareRange: { from: string; to: string };
  comparisonMode?: StatsComparisonMode | undefined;
}

function categoryKey(categoryId: string | null): string {
  return categoryId ?? "uncategorized";
}

/**
 * Decimal growth keeping the product semantics of `calculateGrowth`:
 * previous zero + current zero -> 0%; previous zero + current non-zero -> 100%.
 */
function calculateDecimalGrowth(
  current: Decimal,
  previous: Decimal
): { percent: number; amount: string } {
  const delta = current.minus(previous);
  if (previous.isZero()) {
    return { amount: delta.toFixed(), percent: current.isZero() ? 0 : 100 };
  }
  return { amount: delta.toFixed(), percent: delta.dividedBy(previous).times(100).toNumber() };
}

function calculateHeatmapStats(amounts: number[]): CalendarHeatmapStats {
  if (amounts.length === 0) {
    return { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 };
  }
  const sorted = [...amounts].sort((left, right) => left - right);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? min;
  const avg = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const p80Index = Math.max(0, Math.ceil(sorted.length * 0.8) - 1);
  return {
    minAmount: min,
    maxAmount: max,
    avgAmount: avg,
    p80Amount: sorted[p80Index] ?? max,
  };
}

/** Inclusive civil-day length of a YYYY-MM-DD range, without clock drift. */
function civilDayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return end >= start ? Math.round((end - start) / 86_400_000) + 1 : 0;
}

/**
 * Shared assembly for enhanced stats DTOs. Both the PostgreSQL adapter and the
 * offline startup-cache selector feed their own buckets through this function
 * so online and offline statistics cannot drift apart.
 */
export function buildEnhancedStatsDto({
  mainCurrency,
  unconvertedCount,
  current,
  previous,
  queryRange,
  compareRange,
  comparisonMode,
}: BuildEnhancedStatsDtoInput): EnhancedStatsDto {
  const growth = calculateDecimalGrowth(current.total, previous.total);
  const dayCount = civilDayCount(queryRange.from, queryRange.to);
  const dailyAverage = dayCount > 0 ? current.total.dividedBy(dayCount).toNumber() : 0;

  const categories = [...current.categories.values()]
    .toSorted((left, right) => right.total.cmp(left.total))
    .map((category) => {
      const previousCategory = previous.categories.get(categoryKey(category.id));
      const categoryGrowth = calculateDecimalGrowth(
        category.total,
        previousCategory?.total ?? new Decimal(0)
      );
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        totalOriginal: "0",
        totalConverted: category.total.toFixed(),
        currency: mainCurrency,
        percent: current.total.gt(0)
          ? category.total.dividedBy(current.total).times(100).toNumber()
          : 0,
        count: category.count,
        trend: {
          percent: categoryGrowth.percent,
          amount: categoryGrowth.amount,
        },
      };
    });

  const sortedDays = [...current.days.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right)
  );
  const chart = sortedDays.map(([date, day]) => ({ date, total: day.total.toNumber() }));
  const heatmapDays: CalendarDayData[] = sortedDays.map(([date, day]) => ({
    date,
    totalAmount: day.total.toNumber(),
    entryCount: day.count,
    currencies: [...day.currencies],
  }));

  return {
    unconvertedCount,
    summary: {
      total: current.total.toFixed(),
      currency: mainCurrency,
      trend: {
        percent: growth.percent,
        amount: growth.amount,
      },
      dailyAverage,
      comparison: {
        mode: comparisonMode ?? "same_period",
        from: compareRange.from,
        to: compareRange.to,
        previousTotal: previous.total.toFixed(),
        amountDelta: current.total.minus(previous.total).toFixed(),
        percent: growth.percent,
      },
    },
    categories,
    chart,
    heatmap: {
      days: heatmapDays,
      stats: calculateHeatmapStats(heatmapDays.map((day) => day.totalAmount)),
    },
  };
}
