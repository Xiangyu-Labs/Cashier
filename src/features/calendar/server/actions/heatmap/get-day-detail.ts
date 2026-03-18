/**
 * Get Day Detail Action
 *
 * Fetches detailed entries for a specific date.
 */

"use server";

import { db } from "@/lib/db";
import { requireLedgerAccess } from "@/features/auth/server";
import { entryCategories, ledgerEntries } from "@/features/ledger/server";
import { sourceDocuments } from "@/features/source-document/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { GetDayDetailSchema } from "./schemas";
import type { CalendarDayDetailResponse, CalendarDayDetailEntry } from "../../../types";
import type { z } from "zod";

/**
 * Get detailed entries for a specific date.
 * Note: Uses requireLedgerAccess directly because the function signature takes an input object
 * rather than ledgerId as the first parameter.
 */
export async function getCalendarDayDetail(
  input: z.infer<typeof GetDayDetailSchema>
): Promise<CalendarDayDetailResponse> {
  const { ledgerId, date, filters } = GetDayDetailSchema.parse(input);

  await requireLedgerAccess(ledgerId);

  const conditions = [
    eq(ledgerEntries.ledgerId, ledgerId),
    isNull(ledgerEntries.deletedAt),
    sql`${sourceDocuments.entryDate} = ${date}`,
  ];

  if (filters?.currency != null && filters.currency !== "") {
    conditions.push(eq(ledgerEntries.currency, filters.currency));
  }
  if (filters?.categoryId != null && filters.categoryId !== "") {
    conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
  }

  const results = await db
    .select({
      id: ledgerEntries.id,
      itemName: ledgerEntries.itemName,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      convertedAmount: ledgerEntries.convertedAmount,
      categoryId: ledgerEntries.categoryId,
      categoryName: entryCategories.name,
      categoryIcon: entryCategories.icon,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      sourceDocumentTitle: sourceDocuments.title,
    })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
    .leftJoin(entryCategories, eq(ledgerEntries.categoryId, entryCategories.id))
    .where(and(...conditions))
    .orderBy(ledgerEntries.createdAt);

  const entries: CalendarDayDetailEntry[] = results.map((row) => ({
    id: row.id,
    itemName: row.itemName,
    amount: parseFloat(row.amount) ?? 0,
    currency: row.currency ?? "",
    convertedAmount: row.convertedAmount != null ? parseFloat(row.convertedAmount) : undefined,
    categoryId: row.categoryId ?? undefined,
    categoryName: row.categoryName ?? undefined,
    categoryIcon: row.categoryIcon ?? undefined,
    sourceDocumentId: row.sourceDocumentId!,
    sourceDocumentTitle: row.sourceDocumentTitle ?? undefined,
  }));

  const totalAmount = entries.reduce((sum, e) => sum + (e.convertedAmount ?? e.amount), 0);

  return {
    date,
    entries,
    totalAmount,
    totalCount: entries.length,
  };
}
