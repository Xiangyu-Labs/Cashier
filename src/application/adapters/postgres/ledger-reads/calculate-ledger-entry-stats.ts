import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import {
  buildLedgerEntryFilterConditions,
  type LedgerEntryFilterParams,
} from "./build-ledger-entry-filters";
import type { LedgerEntrySummary } from "@/modules/ledger/contracts";
import { ledgers } from "@/persistence";

// Current-runtime aggregate implementation.

interface CalculateLedgerEntryStatsInput {
  ledgerId: string;
  filters: LedgerEntryFilterParams;
  mainCurrency?: string;
}

export async function calculateLedgerEntryStats({
  ledgerId,
  filters,
  mainCurrency,
}: CalculateLedgerEntryStatsInput): Promise<LedgerEntrySummary> {
  const conditions = buildLedgerEntryFilterConditions(ledgerId, filters);

  const totalsQuery = await db
    .select({
      currency: ledgerEntries.currency,
      total: sql<number>`sum(${ledgerEntries.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(ledgerEntries)
    .where(and(...conditions))
    .groupBy(ledgerEntries.currency);

  const totals = totalsQuery.map((row) => ({
    currency: row.currency ?? "CNY",
    total: Number(row.total) ?? 0,
    count: Number(row.count) ?? 0,
  }));

  const trendQuery = await db
    .select({
      date: sourceDocuments.entryDate,
      total: sql<string>`sum(COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}))`,
    })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
    .where(and(...conditions))
    .groupBy(sourceDocuments.entryDate)
    .orderBy(sourceDocuments.entryDate);

  const trend = trendQuery
    .filter((row) => row.date != null && row.date !== "")
    .map((row) => ({
      date: row.date ?? "",
      total: Number(row.total) ?? 0,
    }));

  const convertedTotalResult = await db
    .select({
      total: sql<string>`sum(COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}))`,
    })
    .from(ledgerEntries)
    .where(and(...conditions));
  const convertedTotalValue = Number(convertedTotalResult[0]?.total) ?? 0;

  const settings =
    mainCurrency == null
      ? await db.query.ledgers.findFirst({
          where: eq(ledgers.id, ledgerId),
          columns: { metadata: true },
        })
      : null;
  const effectiveMainCurrency =
    mainCurrency ?? settings?.metadata?.settings?.mainCurrency ?? "CNY";

  return {
    convertedTotal: {
      total: convertedTotalValue,
      currency: effectiveMainCurrency,
    },
    totals,
    trend,
    byCategory: [],
  };
}
