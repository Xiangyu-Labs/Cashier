"use server";

import { db } from "@/lib/db";
import { currencyRates } from "@/persistence";
import { ledgerEntries, ledgers } from "@/persistence";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { convertAmount, calculateGrowth } from "./utils";
import { parseDateString } from "@/lib/date-utils";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

export interface EnhancedCategoryStat {
  id: string | null;
  name: string;
  icon: string | null;
  totalOriginal: number;
  totalConverted: number;
  currency: string;
  percent: number;
  count: number;
  trend: {
    percent: number;
    amount: number;
  };
}

export interface EnhancedStats {
  summary: {
    total: number;
    currency: string;
    trend: {
      percent: number;
      amount: number;
    };
    dailyAverage: number;
  };
  categories: EnhancedCategoryStat[];
  chart: { date: string; total: number }[];
  heatmap: {
    days: CalendarDayData[];
    stats: CalendarHeatmapStats;
  };
}

export async function getEnhancedStats({
  ledgerId,
  queryRange,
  compareRange,
}: {
  ledgerId: string;
  queryRange: { from: string; to: string };
  compareRange: { from: string; to: string };
}): Promise<EnhancedStats> {
  const ledger = await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
    columns: {
      metadata: true,
    },
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";

  const currentStart = parseDateString(queryRange.from);
  const currentEnd = parseDateString(queryRange.to);

  const fetchEntries = async (startStr: string, endStr: string) => {
    return await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        sql`${ledgerEntries.sourceDocumentId} IN (
                    SELECT id FROM source_documents
                    WHERE ledger_id = ${ledgerId} AND entry_date >= ${startStr} AND entry_date <= ${endStr} AND deleted_at IS NULL
                )`
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

  const allEntries = [...currentEntries, ...prevEntries];
  const uniqueDates = Array.from(
    new Set(
      allEntries
        .map((e) => e.sourceDocument?.entryDate)
        .filter((d): d is string => d != null && d !== "")
    )
  );

  const ratesMap: Record<string, Record<string, number>> = {};
  if (uniqueDates.length > 0) {
    const ratesData = await db.query.currencyRates.findMany({
      where: inArray(currencyRates.date, uniqueDates),
    });
    ratesData.forEach((r) => {
      ratesMap[r.date] = r.rates;
    });
  }

  const processBatch = (entries: typeof currentEntries) => {
    let total = 0;
    const categoryMap = new Map<
      string,
      {
        id: string | null;
        name: string;
        icon: string | null;
        amount: number;
        count: number;
      }
    >();

    const dailyMap = new Map<string, number>();

    for (const entry of entries) {
      const dateStr = entry.sourceDocument?.entryDate ?? "";
      const dayRates = ratesMap[dateStr] ?? null;

      const converted = convertAmount({
        amount: Number(entry.amount),
        fromCurrency: entry.currency ?? mainCurrency,
        toCurrency: mainCurrency,
        rates: dayRates,
      });

      total += converted;

      const catId = entry.categoryId ?? "uncategorized";
      const catName = entry.category?.name ?? "Uncategorized";
      const catIcon = entry.category?.icon ?? null;

      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          id: entry.categoryId,
          name: catName,
          icon: catIcon,
          amount: 0,
          count: 0,
        });
      }
      const cat = categoryMap.get(catId)!;
      cat.amount += converted;
      cat.count += 1;

      if (dateStr !== "") {
        const dayVal = dailyMap.get(dateStr) ?? 0;
        dailyMap.set(dateStr, dayVal + converted);
      }
    }

    return { total, categoryMap, dailyMap };
  };

  const currentStats = processBatch(currentEntries);
  const prevStats = processBatch(prevEntries);

  const summaryTrend = calculateGrowth(currentStats.total, prevStats.total);

  const categories: EnhancedCategoryStat[] = Array.from(currentStats.categoryMap.values())
    .map((cat) => {
      const prevCatApi = prevStats.categoryMap.get(cat.id ?? "uncategorized");
      const prevAmount = prevCatApi ? prevCatApi.amount : 0;

      const growth = calculateGrowth(cat.amount, prevAmount);

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        totalOriginal: 0,
        totalConverted: cat.amount,
        currency: mainCurrency,
        percent: currentStats.total > 0 ? (cat.amount / currentStats.total) * 100 : 0,
        count: cat.count,
        trend: growth,
      };
    })
    .sort((a, b) => b.totalConverted - a.totalConverted);

  const chartData = Array.from(currentStats.dailyMap.entries())
    .map(([date, total]) => ({
      date,
      total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const today = new Date();
  const effectiveEnd = currentEnd > today ? today : currentEnd;

  const oneDay = 24 * 60 * 60 * 1000;
  const daysDiff =
    Math.round(Math.abs((effectiveEnd.getTime() - currentStart.getTime()) / oneDay)) + 1;
  const dailyAvg = daysDiff > 0 ? currentStats.total / daysDiff : 0;

  const entriesByDate = new Map<string, typeof currentEntries>();
  for (const entry of currentEntries) {
    const date = entry.sourceDocument?.entryDate;
    if (date == null || date === "") continue;
    if (!entriesByDate.has(date)) {
      entriesByDate.set(date, []);
    }
    entriesByDate.get(date)!.push(entry);
  }

  const heatmapDays: CalendarDayData[] = Array.from(currentStats.dailyMap.entries())
    .map(([date, total]) => {
      const dayEntries = entriesByDate.get(date) ?? [];
      return {
        date,
        totalAmount: total,
        entryCount: dayEntries.length,
        currencies: [...new Set(dayEntries.map((e) => e.currency ?? mainCurrency))],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const heatmapStats = calculateStats(heatmapDays.map((d) => d.totalAmount));

  return {
    summary: {
      total: currentStats.total,
      currency: mainCurrency,
      trend: summaryTrend,
      dailyAverage: dailyAvg,
    },
    categories,
    chart: chartData,
    heatmap: {
      days: heatmapDays,
      stats: heatmapStats,
    },
  };
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
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;

  const p80Index = Math.floor(sorted.length * 0.8);
  const p80 = sorted[p80Index] ?? max;

  return {
    minAmount: min,
    maxAmount: max,
    avgAmount: avg,
    p80Amount: p80,
  };
}
