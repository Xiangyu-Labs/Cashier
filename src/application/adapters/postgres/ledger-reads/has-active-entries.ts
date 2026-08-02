import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerEntries, sourceDocuments } from "@/persistence";

export async function hasActiveLedgerEntries(ledgerId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)));
  return Number(row?.count ?? 0) > 0;
}
