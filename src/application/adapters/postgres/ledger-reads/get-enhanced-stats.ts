import Decimal from "decimal.js";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currencyRates, entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { parseDateString } from "@/lib/date-utils";
import {
  parseEnhancedStatsInput,
  type GetEnhancedStatsInput,
} from "@/modules/stats/contract-schemas";
import { convertAmount, calculateGrowth } from "@/modules/stats/utils";
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
  entryDate: string | null;
  currency: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  totalAmount: string;
  entryCount: number;
}

async function fetchAggregatedRows(
  ledgerId: string,
  startStr: string,
  endStr: string
): Promise<AggregatedRow[]> {
  return db
    .select({
      entryDate: sourceDocuments.entryDate,
      currency: ledgerEntries.currency,
      categoryId: ledgerEntries.categoryId,
      categoryName: entryCategories.name,
      categoryIcon: entryCategories.icon,
      totalAmount: sql<string>`SUM(CAST(${ledgerEntries.amount} AS numeric))`,
      entryCount: sql<number>`COUNT(*)`,
    })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
    .leftJoin(entryCategories, eq(ledgerEntries.categoryId, entryCategories.id))
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt),
        sql`${sourceDocuments.activeRevisionId} IS NOT NULL`,
        sql`${sourceDocuments.activeRevisionId} = ${ledgerEntries.sourceDocumentRevisionId}`,
        gte(sourceDocuments.entryDate, startStr),
        lte(sourceDocuments.entryDate, endStr)
      )
    )
    .groupBy(
      sourceDocuments.entryDate,
      ledgerEntries.currency,
      ledgerEntries.categoryId,
      entryCategories.name,
      entryCategories.icon
    )
    .orderBy(sourceDocuments.entryDate);
}

async function fetchRatesForDates(
  dates: string[]
): Promise<Record<string, Record<string, string>>> {
  const ratesMap: Record<string, Record<string, string>> = {};

  if (dates.length > 0) {
    const ratesData = await db.query.currencyRates.findMany({
      where: inArray(currencyRates.date, dates),
    });

    for (const rate of ratesData) {
      const stringRates: Record<string, string> = {};
      for (const [k, v] of Object.entries(rate.rates)) {
        stringRates[k] = String(v);
      }
      ratesMap[rate.date] = stringRates;
    }
  }

  return ratesMap;
}

function processBatch(
  rows: AggregatedRow[],
  mainCurrency: string,
  ratesMap: Record<string, Record<string, string>>
) {
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
  const dateInfoMap = new Map<
    string,
    { entryCount: number; currencies: Set<string> }
  >();

  for (const row of rows) {
    const dateStr = row.entryDate ?? "";
    const converted = new Decimal(
      convertAmount({
        amount: row.totalAmount,
        fromCurrency: row.currency ?? mainCurrency,
        toCurrency: mainCurrency,
        rates: ratesMap[dateStr] ?? null,
      })
    );

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
    dailyMap: new Map(
      Array.from(dailyMap.entries()).map(([d, v]) => [d, v.toNumber()])
    ),
    dateInfoMap,
  };
}

async function collectUniqueDates(
  rows: AggregatedRow[]
): Promise<string[]> {
  return Array.from(
    new Set(
      rows
        .map((row) => row.entryDate)
        .filter((date): date is string => date != null && date !== "")
    )
  );
}

export async function getEnhancedStatsQuery({
  ledgerId,
  queryRange,
  compareRange,
}: GetEnhancedStatsInput): Promise<EnhancedStatsDto> {
  const ledger = await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
    columns: {
      metadata: true,
    },
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const currentStart = parseDateString(queryRange.from);
  const currentEnd = parseDateString(queryRange.to);

  const [currentRows, prevRows] = await Promise.all([
    fetchAggregatedRows(ledgerId, queryRange.from, queryRange.to),
    fetchAggregatedRows(ledgerId, compareRange.from, compareRange.to),
  ]);

  const allDates = [
    ...(await collectUniqueDates(currentRows)),
    ...(await collectUniqueDates(prevRows)),
  ].filter((value, index, self) => self.indexOf(value) === index);

  const ratesMap = await fetchRatesForDates(allDates);

  const currentStats = processBatch(currentRows, mainCurrency, ratesMap);
  const prevStats = processBatch(prevRows, mainCurrency, ratesMap);

  const categories: EnhancedCategoryStatDto[] = Array.from(
    currentStats.categoryMap.values()
  )
    .map((category) => {
      const prevCategory = prevStats.categoryMap.get(
        category.id ?? "uncategorized"
      );
      const prevAmount = prevCategory?.amount ?? new Decimal(0);
      const categoryTotal = category.amount.toFixed();
      const prevTotal = prevAmount.toFixed();
      const growth = calculateGrowth(
        Number(categoryTotal),
        Number(prevTotal)
      );
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

  const effectiveEnd =
    currentEnd > new Date() ? new Date() : currentEnd;
  const oneDay = 24 * 60 * 60 * 1000;
  const daysDiff =
    Math.round(
      Math.abs((effectiveEnd.getTime() - currentStart.getTime()) / oneDay)
    ) + 1;

  const heatmapDays: CalendarDayData[] = Array.from(
    currentStats.dailyMap.entries()
  )
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

  const totalGrowth = calculateGrowth(
    Number(currentStats.total),
    Number(prevStats.total)
  );

  return {
    summary: {
      total: currentStats.total,
      currency: mainCurrency,
      trend: {
        percent: totalGrowth.percent,
        amount: String(totalGrowth.amount),
      },
      dailyAverage:
        daysDiff > 0 ? Number(currentStats.total) / daysDiff : 0,
    },
    categories,
    chart,
    heatmap: {
      days: heatmapDays,
      stats: calculateStats(heatmapDays.map((day) => day.totalAmount)),
    },
  };
}

export async function getEnhancedStats(
  input: GetEnhancedStatsInput
): Promise<EnhancedStatsDto> {
  const validatedInput = parseEnhancedStatsInput(input);
  return getEnhancedStatsQuery(validatedInput);
}
