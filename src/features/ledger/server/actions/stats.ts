"use server";

import { db } from "@/lib/db";
import { ledgers, ledgerEntries, currencyRates, sourceDocuments } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { convertAmount } from "@/features/stats/server/utils";

import { LedgerEntrySummary } from "@/types/api";

import { forLedger } from "@/lib/db/scoped-query";

export async function getLedgerStatsAction(
    ledgerId: string,
    startDate?: string,
    endDate?: string,
    mainCurrency?: string,
    filters?: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }
): Promise<LedgerEntrySummary> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    const q = forLedger(ledgerEntries, ledgerId);
    const conditions = [q.whereActive];
    // Date filtering now uses sourceDocument.entryDate via subquery
    if (startDate) {
        conditions.push(
            sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date >= ${startDate} AND deleted_at IS NULL
            )`
        );
    }
    if (endDate) {
        conditions.push(
            sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date <= ${endDate} AND deleted_at IS NULL
            )`
        );
    }
    // Additional filter conditions
    if (filters?.categoryId) conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
    if (filters?.currency) conditions.push(eq(ledgerEntries.currency, filters.currency));
    // Filter by convertedAmount - use CAST to compare as numbers, not strings
    if (filters?.minAmount !== undefined && filters?.minAmount !== null) {
        conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${filters.minAmount}`);
    }
    if (filters?.maxAmount !== undefined && filters?.maxAmount !== null) {
        conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) <= ${filters.maxAmount}`);
    }

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

    // 2. Trend (Daily Total) - Join with sourceDocuments to get entryDate
    const trendQuery = await db
        .select({
            date: sourceDocuments.entryDate,
            total: sql<number>`sum(COALESCE(CAST(${ledgerEntries.convertedAmount} AS REAL), CAST(${ledgerEntries.amount} AS REAL)))`,
        })
        .from(ledgerEntries)
        .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
        .where(and(...conditions))
        .groupBy(sourceDocuments.entryDate)
        .orderBy(sourceDocuments.entryDate);

    // entryDate is now a yyyy-MM-dd string, no conversion needed
    const trend = trendQuery
        .filter(t => t.date)
        .map(t => ({
            date: t.date || "",
            total: Number(t.total) || 0
        }));

    // byCategory is handled by getEnhancedStats, this action only provides totals
    const byCategory: LedgerEntrySummary['byCategory'] = [];

    // 4. Converted Total Logic - Accurate conversion by date
    let convertedTotalValue = 0;
    const effectiveMainCurrency = mainCurrency || (await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
        columns: { metadata: true }
    }))?.metadata?.settings?.mainCurrency || "CNY";

    // Fetch entries with their source documents to get matching dates
    const entries = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        columns: {
            amount: true,
            currency: true,
        },
        with: {
            sourceDocument: {
                columns: {
                    entryDate: true,
                }
            }
        }
    });

    if (entries.length > 0) {
        // Get entryDate from sourceDocument
        const uniqueDates = Array.from(new Set(entries.map(e => e.sourceDocument?.entryDate).filter((d): d is string => !!d)));

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
            const dateStr = entry.sourceDocument?.entryDate || "";
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
