import { db } from "@/lib/db";
import { ledgerEntries } from "@/persistence";
import { and, eq, isNull, sql } from "drizzle-orm";

export async function getUncategorizedEntryCount(ledgerId: string): Promise<number> {
  const result = await db
    .select({
      count: sql<number>`count(*)`.as("count"),
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        isNull(ledgerEntries.categoryId)
      )
    );

  return result[0]?.count ?? 0;
}
