import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { entryCategories, ledgerEntries } from "@/persistence";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

export async function listEntryCategoriesWithCount(ledgerId: string) {
  const q = forLedger(entryCategories, ledgerId);

  const categories = await db.query.entryCategories.findMany({
    where: q.whereActive,
    orderBy: asc(entryCategories.sortOrder),
  });

  const entryCounts = await db
    .select({
      categoryId: ledgerEntries.categoryId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)))
    .groupBy(ledgerEntries.categoryId);

  const countMap = new Map(
    entryCounts.map((entryCount) => [entryCount.categoryId, entryCount.count])
  );

  return categories.map((category) => ({
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    deletedAt: category.deletedAt != null ? category.deletedAt.toISOString() : null,
    entryCount: countMap.get(category.id) ?? 0,
  }));
}
