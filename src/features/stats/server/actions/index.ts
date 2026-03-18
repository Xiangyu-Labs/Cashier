"use server";

import { db } from "@/lib/db";
import { currencyRates } from "@/features/currency/server";
import { ledgerEntries, ledgers } from "@/features/ledger/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { convertAmount, calculateGrowth } from "../utils";
import { parseDateString } from "@/lib/date-utils";

import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

export interface EnhancedCategoryStat {
  id: string | null;
  name: string;
  icon: string | null;
  totalOriginal: number; // Sum of amounts in original currencies (mixed, just for reference if needed)
  totalConverted: number; // Converted to Main Currency
  currency: string; // Main Currency
  percent: number; // % of total expense
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
  // 1. Get Ledger Settings (Main Currency)
  const ledger = await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
    columns: {
      metadata: true,
    },
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";

  // 2. Parse Dates for daily average calculation
  const currentStart = parseDateString(queryRange.from);
  const currentEnd = parseDateString(queryRange.to);

  // 3. Fetch Entries
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

  // 4. Fetch Currency Rates (Optimization: Only fetch distinct dates needed)
  // We need rates for every unique date in the entries.
  const allEntries = [...currentEntries, ...prevEntries];
  // Collect unique dates (as strings YYYY-MM-DD) from source documents
  const uniqueDates = Array.from(
    new Set(allEntries.map((e) => e.sourceDocument?.entryDate).filter((d): d is string => d != null && d !== ""))
  );

  // Fetch rates from DB
  const ratesMap: Record<string, Record<string, number>> = {};
  if (uniqueDates.length > 0) {
    const ratesData = await db.query.currencyRates.findMany({
      where: inArray(currencyRates.date, uniqueDates),
    });
    ratesData.forEach((r) => {
      ratesMap[r.date] = r.rates; // r.rates is JSON
    });
  }

  // 5. Aggregation Logic

  // Helper to process a batch of entries
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
      // Use rates for that specific day
      const dayRates = ratesMap[dateStr] ?? null;

      // Convert amount
      const converted = convertAmount({
        amount: Number(entry.amount),
        fromCurrency: entry.currency ?? mainCurrency, // assumption
        toCurrency: mainCurrency,
        rates: dayRates,
      });

      total += converted;

      // Category Aggregation
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

      // Daily Aggregation (for Chart)
      if (dateStr !== "") {
        const dayVal = dailyMap.get(dateStr) ?? 0;
        dailyMap.set(dateStr, dayVal + converted);
      }
    }

    return { total, categoryMap, dailyMap };
  };

  const currentStats = processBatch(currentEntries);
  const prevStats = processBatch(prevEntries);

  // 6. Final Formatting

  // Summary Trend
  const summaryTrend = calculateGrowth(currentStats.total, prevStats.total);

  // Categories
  // We only list categories from CURRENT period?
  // Or do we include prev ones? Usually stats show "Where did I spend THIS month"
  // So we iterate current stats categories, but check prev stats for trend.

  const categories: EnhancedCategoryStat[] = Array.from(currentStats.categoryMap.values())
    .map((cat) => {
      // Find same category in prev Stats
      const prevCatApi = prevStats.categoryMap.get(cat.id ?? "uncategorized");
      const prevAmount = prevCatApi ? prevCatApi.amount : 0;

      const growth = calculateGrowth(cat.amount, prevAmount);

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        totalOriginal: 0, // Not tracking for now
        totalConverted: cat.amount,
        currency: mainCurrency,
        percent: currentStats.total > 0 ? (cat.amount / currentStats.total) * 100 : 0,
        count: cat.count,
        trend: growth,
      };
    })
    .sort((a, b) => b.totalConverted - a.totalConverted);

  // Chart Data
  const chartData = Array.from(currentStats.dailyMap.entries())
    .map(([date, total]) => ({
      date,
      total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Daily Average
  // Days elapsed? Or total days in range?
  // Usually "Daily Average" = Total / Days In Range (or Days Elapsed if current month?)
  // For current/ongoing periods: use days elapsed up to today
  // For past periods: use total days in range
  const today = new Date();
  const effectiveEnd = currentEnd > today ? today : currentEnd;

  const oneDay = 24 * 60 * 60 * 1000;
  const daysDiff =
    Math.round(Math.abs((effectiveEnd.getTime() - currentStart.getTime()) / oneDay)) + 1;
  const dailyAvg = daysDiff > 0 ? currentStats.total / daysDiff : 0;

  // Calculate heatmap stats - Pre-group entries by date for O(n+m) performance
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

/**
 * Calculate statistics for heatmap color mapping
 */
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

  // Calculate 80th percentile
  const p80Index = Math.floor(sorted.length * 0.8);
  const p80 = sorted[p80Index] ?? max;

  return {
    minAmount: min,
    maxAmount: max,
    avgAmount: avg,
    p80Amount: p80,
  };
}
