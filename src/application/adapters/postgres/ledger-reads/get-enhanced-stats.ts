import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { currencyRates, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { parseDateString } from "@/lib/date-utils";
import {
  parseEnhancedStatsInput,
  type GetEnhancedStatsInput,
} from "@/modules/stats/contract-schemas";
import { convertAmount, calculateGrowth } from "@/modules/stats/utils";
import type { EnhancedCategoryStatDto, EnhancedStatsDto } from "@/modules/stats/contracts";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";
import { buildLedgerEntryVisibilityCondition } from "./ledger-entry-visibility";

function whereStatsSourceDocumentActive(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt))!;
}

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
  const entryScope = forLedger(ledgerEntries, ledgerId);

  const fetchEntries = async (startStr: string, endStr: string) => {
    const sourceDocumentsInRange = db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          whereStatsSourceDocumentActive(ledgerId),
          gte(sourceDocuments.entryDate, startStr),
          lte(sourceDocuments.entryDate, endStr)
        )
      );

    return db.query.ledgerEntries.findMany({
      where: and(
        entryScope.whereActive,
        buildLedgerEntryVisibilityCondition(ledgerId),
        inArray(ledgerEntries.sourceDocumentId, sourceDocumentsInRange)
      ),
      with: {
        category: true,
        sourceDocument: {
          columns: {
            entryDate: true,
          },
        },
      },
    });
  };

  const [currentEntries, prevEntries] = await Promise.all([
    fetchEntries(queryRange.from, queryRange.to),
    fetchEntries(compareRange.from, compareRange.to),
  ]);

  const uniqueDates = Array.from(
    new Set(
      [...currentEntries, ...prevEntries]
        .map((entry) => entry.sourceDocument?.entryDate)
        .filter((date): date is string => date != null && date !== "")
    )
  );

  const ratesMap: Record<string, Record<string, string>> = {};
  if (uniqueDates.length > 0) {
    const ratesData = await db.query.currencyRates.findMany({
      where: inArray(currencyRates.date, uniqueDates),
    });
    for (const rate of ratesData) {
      const stringRates: Record<string, string> = {};
      for (const [k, v] of Object.entries(rate.rates)) {
        stringRates[k] = String(v);
      }
      ratesMap[rate.date] = stringRates;
    }
  }

  const processBatch = (entries: typeof currentEntries) => {
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

    for (const entry of entries) {
      const dateStr = entry.sourceDocument?.entryDate ?? "";
      const converted = new Decimal(
        convertAmount({
          amount: entry.amount,
          fromCurrency: entry.currency ?? mainCurrency,
          toCurrency: mainCurrency,
          rates: ratesMap[dateStr] ?? null,
        })
      );

      total = total.plus(converted);

      const categoryKey = entry.categoryId ?? "uncategorized";
      const categoryName = entry.category?.name ?? "Uncategorized";
      const categoryIcon = entry.category?.icon ?? null;

      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, {
          id: entry.categoryId,
          name: categoryName,
          icon: categoryIcon,
          amount: new Decimal(0),
          count: 0,
        });
      }

      const category = categoryMap.get(categoryKey)!;
      category.amount = category.amount.plus(converted);
      category.count += 1;

      if (dateStr !== "") {
        dailyMap.set(dateStr, (dailyMap.get(dateStr) ?? new Decimal(0)).plus(converted));
      }
    }

    return {
      total: total.toFixed(),
      categoryMap,
      dailyMap: new Map(
        Array.from(dailyMap.entries()).map(([d, v]) => [d, v.toNumber()])
      ),
    };
  };

  const currentStats = processBatch(currentEntries);
  const prevStats = processBatch(prevEntries);

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

  const entriesByDate = new Map<string, typeof currentEntries>();
  for (const entry of currentEntries) {
    const date = entry.sourceDocument?.entryDate;
    if (date == null || date === "") continue;
    const dayEntries = entriesByDate.get(date) ?? [];
    dayEntries.push(entry);
    entriesByDate.set(date, dayEntries);
  }

  const heatmapDays: CalendarDayData[] = Array.from(currentStats.dailyMap.entries())
    .map(([date, totalAmount]) => {
      const dayEntries = entriesByDate.get(date) ?? [];
      return {
        date,
        totalAmount,
        entryCount: dayEntries.length,
        currencies: [...new Set(dayEntries.map((entry) => entry.currency ?? mainCurrency))],
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
