"use server";

import { db } from "@/lib/db";
import { ledgers, ledgerEntries, currencyRates } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { convertAmount } from "@/features/stats/server/utils";
import { formatDateForApi, parseDateRangeStart, parseDateRangeEnd } from "@/lib/date-utils";

import { LedgerEntrySummary } from "@/types/api";

import { forLedger } from "@/lib/db/scoped-query";

export async function getLedgerStatsAction(
    ledgerId: string,
    startDate?: string,
    endDate?: string,
    mainCurrency?: string
): Promise<LedgerEntrySummary> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    const q = forLedger(ledgerEntries, ledgerId);
    const conditions = [q.whereActive];
    const parsedStart = parseDateRangeStart(startDate);
    const parsedEnd = parseDateRangeEnd(endDate);
    if (parsedStart) conditions.push(gte(ledgerEntries.entryDate, parsedStart));
    if (parsedEnd) conditions.push(lte(ledgerEntries.entryDate, parsedEnd));

    // 1. Totals by Currency
    const totalsQuery = await db
        .select({
            currency: ledgerEntries.currency,
            total: sql<number>`sum(${ledgerEntries.amount})`,
            count: sql<number>`count(*)`,
        })
        .from(ledgerEntries)
        .where(and(...conditions))
        .groupBy(ledgerEntries.currency);

    const formattedTotals = totalsQuery.map(t => ({
        currency: t.currency || "CNY",
        total: Number(t.total) || 0,
        count: Number(t.count) || 0,
    }));

    // 2. Trend (Daily Total)
    const trendQuery = await db
        .select({
            date: ledgerEntries.entryDate,
            total: sql<number>`sum(${ledgerEntries.amount})`,
        })
        .from(ledgerEntries)
        .where(and(...conditions))
        .groupBy(ledgerEntries.entryDate)
        .orderBy(ledgerEntries.entryDate);

    // Drizzle entryDate mapping might vary, assuming Date object or string
    const trend = trendQuery
        .filter(t => t.date)
        .map(t => ({
            date: t.date ? new Date(t.date).toISOString().split('T')[0] : "",
            total: Number(t.total) || 0
        }));

    // 3. By Category - Stub for now to fix build
    // TODO: Implement full join with entryCategories
    const byCategory: LedgerEntrySummary['byCategory'] = [];

    // 4. Converted Total Logic - Accurate conversion by date
    let convertedTotalValue = 0;
    const effectiveMainCurrency = mainCurrency || (await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
        columns: { metadata: true }
    }))?.metadata?.settings?.mainCurrency || "CNY";

    // Fetch entries with their dates to get matching rates
    const entries = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        columns: {
            amount: true,
            currency: true,
            entryDate: true,
        }
    });

    if (entries.length > 0) {
        // Collect unique dates
        const uniqueDates = Array.from(new Set(entries.map(e => e.entryDate ? formatDateForApi(e.entryDate) : null).filter(Boolean))) as string[];

        // Fetch rates
        const ratesMap: Record<string, Record<string, number>> = {};
        if (uniqueDates.length > 0) {
            const ratesData = await db.query.currencyRates.findMany({
                where: inArray(currencyRates.date, uniqueDates)
            });
            ratesData.forEach(r => {
                ratesMap[r.date] = r.rates as Record<string, number>;
            });
        }

        // Calculate converted total
        for (const entry of entries) {
            const dateStr = entry.entryDate ? formatDateForApi(entry.entryDate) : "";
            const dayRates = ratesMap[dateStr] || null;

            const converted = convertAmount({
                amount: Number(entry.amount),
                fromCurrency: entry.currency || effectiveMainCurrency,
                toCurrency: effectiveMainCurrency,
                rates: dayRates
            });
            convertedTotalValue += converted;
        }
    }

    return {
        convertedTotal: {
            total: convertedTotalValue,
            currency: effectiveMainCurrency
        },
        totals: formattedTotals,
        trend,
        byCategory
    };
}
