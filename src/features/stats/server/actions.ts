"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers, entryCategories, serviceCredentials } from "@/features/ledger/server/schema";
import { currencyRates } from "@/features/currency/server/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { DateRangeType, getDateRange, addPeriod, formatDateForApi } from "@/lib/date-utils";
import { convertAmount, calculateGrowth } from "./utils";

export interface EnhancedCategoryStat {
    id: string | null;
    name: string;
    icon: string | null;
    totalOriginal: number; // Sum of amounts in original currencies (mixed, just for reference if needed)
    totalConverted: number; // Converted to Main Currency
    currency: string;      // Main Currency
    percent: number;       // % of total expense
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
}

export async function getEnhancedStats({
    ledgerId,
    rangeType,
    currentDate = new Date().toISOString(),
    clientTimezoneOffset = 0
}: {
    ledgerId: string;
    rangeType: DateRangeType;
    currentDate?: string;
    clientTimezoneOffset?: number;
}): Promise<EnhancedStats> {

    // 1. Get Ledger Settings (Main Currency)
    const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
        columns: {
            metadata: true
        }
    });

    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

    // 2. Calculate Dates
    const parsedDate = new Date(currentDate);
    // Current Period
    const { startDate: currentStart, endDate: currentEnd } = getDateRange(parsedDate, rangeType);

    // Previous Period (for trend comparison)
    // We strictly subtract 1 period: "Last Month" vs "This Month"
    const prevDate = addPeriod(parsedDate, rangeType, -1);
    const { startDate: prevStart, endDate: prevEnd } = getDateRange(prevDate, rangeType);

    // 3. Fetch Entries
    // We need to fetch entries for BOTH periods.
    // Optimization: Fetch in one go or two? Two is simpler to manage.

    const fetchEntries = async (start: Date, end: Date) => {
        return await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.ledgerId, ledgerId),
                gte(ledgerEntries.entryDate, start),
                lte(ledgerEntries.entryDate, end)
            ),
            with: {
                category: true
            }
        });
    };

    const [currentEntries, prevEntries] = await Promise.all([
        fetchEntries(currentStart, currentEnd),
        fetchEntries(prevStart, prevEnd)
    ]);

    // 4. Fetch Currency Rates (Optimization: Only fetch distinct dates needed)
    // We need rates for every unique date in the entries.
    const allEntries = [...currentEntries, ...prevEntries];
    // Collect unique dates (as strings YYYY-MM-DD)
    const uniqueDates = Array.from(new Set(allEntries.map(e => e.entryDate ? formatDateForApi(e.entryDate) : null).filter(Boolean))) as string[];

    // Fetch rates from DB
    // Ideally use `inArray` but if list is huge it might break. 
    // For personal finance, thousands of entries is rare in a view, but let's be safe.
    // If uniqueDates is empty, we skip.
    let ratesMap: Record<string, any> = {};
    if (uniqueDates.length > 0) {
        const ratesData = await db.query.currencyRates.findMany({
            where: sql`${currencyRates.date} IN ${uniqueDates}`
        });
        ratesData.forEach(r => {
            ratesMap[r.date] = r.rates; // r.rates is JSON
        });
    }

    // 5. Aggregation Logic

    // Helper to process a batch of entries
    const processBatch = (entries: typeof currentEntries) => {
        let total = 0;
        const categoryMap = new Map<string, {
            id: string | null,
            name: string,
            icon: string | null,
            amount: number,
            count: number
        }>();

        const dailyMap = new Map<string, number>();

        for (const entry of entries) {
            const dateStr = entry.entryDate ? formatDateForApi(entry.entryDate) : "";
            // Use rates for that specific day
            const dayRates = ratesMap[dateStr] || null;

            // Convert amount
            const converted = convertAmount({
                amount: Number(entry.amount),
                fromCurrency: entry.currency || mainCurrency, // assumption
                toCurrency: mainCurrency,
                rates: dayRates
            });

            total += converted;

            // Category Aggregation
            const catId = entry.categoryId || "uncategorized";
            const catName = entry.category?.name || "Uncategorized";
            const catIcon = entry.category?.icon || null;

            if (!categoryMap.has(catId)) {
                categoryMap.set(catId, {
                    id: entry.categoryId,
                    name: catName,
                    icon: catIcon,
                    amount: 0,
                    count: 0
                });
            }
            const cat = categoryMap.get(catId)!;
            cat.amount += converted;
            cat.count += 1;

            // Daily Aggregation (for Chart)
            if (dateStr) {
                const dayVal = dailyMap.get(dateStr) || 0;
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

    const categories: EnhancedCategoryStat[] = Array.from(currentStats.categoryMap.values()).map(cat => {
        // Find same category in prev Stats
        const prevCatApi = prevStats.categoryMap.get(cat.id || "uncategorized");
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
            trend: growth
        };
    }).sort((a, b) => b.totalConverted - a.totalConverted);

    // Chart Data
    const chartData = Array.from(currentStats.dailyMap.entries()).map(([date, total]) => ({
        date,
        total
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Daily Average
    // Days elapsed? Or total days in range?
    // Usually "Daily Average" = Total / Days In Range (or Days Elapsed if current month?)
    // Let's use total days in range for consistency, or days elapsed if today is inside range?
    // For simplicity: Days in Range.
    const oneDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round(Math.abs((currentEnd.getTime() - currentStart.getTime()) / oneDay)) + 1;
    const dailyAvg = daysDiff > 0 ? currentStats.total / daysDiff : 0;

    return {
        summary: {
            total: currentStats.total,
            currency: mainCurrency,
            trend: summaryTrend,
            dailyAverage: dailyAvg
        },
        categories,
        chart: chartData
    };
}
