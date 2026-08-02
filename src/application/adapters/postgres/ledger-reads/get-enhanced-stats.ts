import Decimal from "decimal.js";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { parseDateString } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  parseEnhancedStatsInput,
  type GetEnhancedStatsInput,
} from "@/modules/stats/contract-schemas";
import { calculateGrowth } from "@/modules/stats/utils";
import type { EnhancedCategoryStatDto, EnhancedStatsDto } from "@/modules/stats/contracts";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

function calculateStats(amounts: number[]): CalendarHeatmapStats {
  if (amounts.length === 0) {
    return {
      minAmount: 0,
      maxAmount: 0,
      avgAmount: 0,
      p80Amount: 0,
    };
  }

  const sorted = [...amounts].sort((a, b) => a - b);
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

interface AggregatedRow {
  period: "current" | "previous";
  entryDate: string | null;
  currency: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  totalAmount: string;
  entryCount: number;
  mainCurrency: string;
  missingProjectionCount: number;
}

async function fetchAggregatedRows(
  ledgerId: string,
  current: { from: string; to: string },
  previous: { from: string; to: string }
): Promise<AggregatedRow[]> {
  const result = await db.execute<AggregatedRow & Record<string, unknown>>(sql`
    WITH ranges(period, from_date, to_date) AS (
      VALUES
        ('current'::text, ${current.from}::date, ${current.to}::date),
        ('previous'::text, ${previous.from}::date, ${previous.to}::date)
    )
    SELECT ranges.period, documents.entry_date AS "entryDate",
      entries.currency, entries.category_id AS "categoryId",
      categories.name AS "categoryName", categories.icon AS "categoryIcon",
      sum(coalesce(entries.converted_amount, entries.amount))::text AS "totalAmount",
      count(*)::int AS "entryCount", ledgers.main_currency AS "mainCurrency",
      count(*) FILTER (
        WHERE entries.converted_amount IS NULL
          AND coalesce(entries.currency, 'CNY') <> ledgers.main_currency
      )::int AS "missingProjectionCount"
    FROM ranges
    JOIN source_documents documents
      ON documents.ledger_id = ${ledgerId}
      AND documents.entry_date BETWEEN ranges.from_date AND ranges.to_date
      AND documents.deleted_at IS NULL
    JOIN ledger_entries entries
      ON entries.ledger_id = documents.ledger_id
      AND entries.source_document_id = documents.id
      AND entries.source_document_revision_id = documents.active_revision_id
      AND entries.deleted_at IS NULL
    JOIN ledgers ON ledgers.id = documents.ledger_id AND ledgers.deleted_at IS NULL
    LEFT JOIN entry_categories categories ON categories.id = entries.category_id
    GROUP BY ranges.period, documents.entry_date, entries.currency, entries.category_id,
      categories.name, categories.icon, ledgers.main_currency
    UNION ALL
    SELECT 'current', NULL, NULL, NULL, NULL, NULL, '0', 0, main_currency, 0
    FROM ledgers WHERE id = ${ledgerId} AND deleted_at IS NULL
  `);
  return result.rows.map((row) => ({
    ...row,
    entryCount: Number(row.entryCount),
    missingProjectionCount: Number(row.missingProjectionCount),
  }));
}

function processBatch(rows: AggregatedRow[], mainCurrency: string) {
  let total = new Decimal(0);
  const categoryMap = new Map<
    string,
    {
      id: string | null;
      name: string;
      icon: string | null;
      amount: Decimal;
      count: number;
    }
  >();
  const dailyMap = new Map<string, Decimal>();
  const dateInfoMap = new Map<string, { entryCount: number; currencies: Set<string> }>();

  for (const row of rows) {
    if (row.entryCount === 0) continue;
    const dateStr = row.entryDate ?? "";
    const converted = new Decimal(row.totalAmount);

    total = total.plus(converted);

    const categoryKey = row.categoryId ?? "uncategorized";
    const categoryName = row.categoryName ?? "Uncategorized";
    const categoryIcon = row.categoryIcon ?? null;

    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        id: row.categoryId,
        name: categoryName,
        icon: categoryIcon,
        amount: new Decimal(0),
        count: 0,
      });
    }

    const cat = categoryMap.get(categoryKey)!;
    cat.amount = cat.amount.plus(converted);
    cat.count += row.entryCount;

    if (dateStr !== "") {
      dailyMap.set(dateStr, (dailyMap.get(dateStr) ?? new Decimal(0)).plus(converted));

      if (!dateInfoMap.has(dateStr)) {
        dateInfoMap.set(dateStr, { entryCount: 0, currencies: new Set<string>() });
      }
      const dateInfo = dateInfoMap.get(dateStr)!;
      dateInfo.entryCount += row.entryCount;
      dateInfo.currencies.add(row.currency ?? mainCurrency);
    }
  }

  return {
    total: total.toFixed(),
    categoryMap,
    dailyMap: new Map(Array.from(dailyMap.entries()).map(([d, v]) => [d, v.toNumber()])),
    dateInfoMap,
  };
}

export async function getEnhancedStatsQuery({
  ledgerId,
  queryRange,
  compareRange,
}: GetEnhancedStatsInput): Promise<EnhancedStatsDto> {
  const currentStart = parseDateString(queryRange.from);
  const currentEnd = parseDateString(queryRange.to);

  const rows = await fetchAggregatedRows(ledgerId, queryRange, compareRange);
  const mainCurrency = rows[0]?.mainCurrency ?? "CNY";
  const missingProjectionCount = rows.reduce((total, row) => total + row.missingProjectionCount, 0);
  if (missingProjectionCount > 0) {
    logger.warn(
      { ledgerId, missingProjectionCount, operation: "enhanced_stats" },
      "Historical entries used audited original-amount compatibility"
    );
  }
  const currentStats = processBatch(
    rows.filter((row) => row.period === "current"),
    mainCurrency
  );
  const prevStats = processBatch(
    rows.filter((row) => row.period === "previous"),
    mainCurrency
  );

  const categories: EnhancedCategoryStatDto[] = Array.from(currentStats.categoryMap.values())
    .map((category) => {
      const prevCategory = prevStats.categoryMap.get(category.id ?? "uncategorized");
      const prevAmount = prevCategory?.amount ?? new Decimal(0);
      const categoryTotal = category.amount.toFixed();
      const prevTotal = prevAmount.toFixed();
      const growth = calculateGrowth(Number(categoryTotal), Number(prevTotal));
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        totalOriginal: "0",
        totalConverted: categoryTotal,
        currency: mainCurrency,
        percent: new Decimal(currentStats.total).gt(0)
          ? category.amount.dividedBy(currentStats.total).times(100).toNumber()
          : 0,
        count: category.count,
        trend: {
          percent: growth.percent,
          amount: String(growth.amount),
        },
      };
    })
    .sort((a, b) => Number(b.totalConverted) - Number(a.totalConverted));

  const chart = Array.from(currentStats.dailyMap.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const effectiveEnd = currentEnd > new Date() ? new Date() : currentEnd;
  const oneDay = 24 * 60 * 60 * 1000;
  const daysDiff =
    Math.round(Math.abs((effectiveEnd.getTime() - currentStart.getTime()) / oneDay)) + 1;

  const heatmapDays: CalendarDayData[] = Array.from(currentStats.dailyMap.entries())
    .map(([date, totalAmount]) => {
      const dateInfo = currentStats.dateInfoMap.get(date);
      return {
        date,
        totalAmount,
        entryCount: dateInfo?.entryCount ?? 0,
        currencies: dateInfo ? [...dateInfo.currencies] : [],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalGrowth = calculateGrowth(Number(currentStats.total), Number(prevStats.total));

  return {
    summary: {
      total: currentStats.total,
      currency: mainCurrency,
      trend: {
        percent: totalGrowth.percent,
        amount: String(totalGrowth.amount),
      },
      dailyAverage: daysDiff > 0 ? Number(currentStats.total) / daysDiff : 0,
    },
    categories,
    chart,
    heatmap: {
      days: heatmapDays,
      stats: calculateStats(heatmapDays.map((day) => day.totalAmount)),
    },
  };
}

export async function getEnhancedStats(input: GetEnhancedStatsInput): Promise<EnhancedStatsDto> {
  const validatedInput = parseEnhancedStatsInput(input);
  return getEnhancedStatsQuery(validatedInput);
}
