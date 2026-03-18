"use server";

import { db } from "@/lib/db";
import { ledgers, ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";

import { type LedgerEntrySummary } from "@/types/api";

import { forLedger } from "@/lib/db/scoped-query";

export async function calculateLedgerStats(
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
  const q = forLedger(ledgerEntries, ledgerId);
  const conditions = [q.whereActive];
  // Date filtering now uses sourceDocument.entryDate via subquery
  if (startDate != null && startDate !== "") {
    conditions.push(
      sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date >= ${startDate} AND deleted_at IS NULL
            )`
    );
  }
  if (endDate != null && endDate !== "") {
    conditions.push(
      sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date <= ${endDate} AND deleted_at IS NULL
            )`
    );
  }
  // Additional filter conditions
  if (filters?.categoryId != null && filters.categoryId !== "")
    conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
  if (filters?.currency != null && filters.currency !== "")
    conditions.push(eq(ledgerEntries.currency, filters.currency));
  // Filter by convertedAmount - use CAST to compare as numbers, not strings
  if (filters?.minAmount !== undefined && filters.minAmount !== null) {
    conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${filters.minAmount}`);
  }
  if (filters?.maxAmount !== undefined && filters.maxAmount !== null) {
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

  const formattedTotals = totalsQuery.map((t) => ({
    currency: t.currency ?? "CNY",
    total: Number(t.total) ?? 0,
    count: Number(t.count) ?? 0,
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
    .filter((t) => t.date != null && t.date !== "")
    .map((t) => ({
      date: t.date ?? "",
      total: Number(t.total) ?? 0,
    }));

  // byCategory is handled by getEnhancedStats, this action only provides totals
  const byCategory: LedgerEntrySummary["byCategory"] = [];

  // 4. Converted Total Logic - Use SQL aggregation for performance
  const ledgerSettings = (
    await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
      columns: { metadata: true },
    })
  )?.metadata?.settings?.mainCurrency;
  const effectiveMainCurrency = mainCurrency ?? ledgerSettings ?? "CNY";

  const convertedTotalResult = await db
    .select({
      total: sql<number>`sum(COALESCE(CAST(${ledgerEntries.convertedAmount} AS REAL), CAST(${ledgerEntries.amount} AS REAL)))`,
    })
    .from(ledgerEntries)
    .where(and(...conditions));

  const convertedTotalValue = Number(convertedTotalResult[0]?.total) ?? 0;

  return {
    convertedTotal: {
      total: convertedTotalValue,
      currency: effectiveMainCurrency,
    },
    totals: formattedTotals,
    trend,
    byCategory,
  };
}

export const getLedgerStatsAction = withLedgerAccess(calculateLedgerStats);
