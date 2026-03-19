import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { entryCategories, ledgerEntries } from "@/persistence";
import type * as schemaModule from "@/persistence";

type DbSchema = typeof schemaModule;

export type LedgerTransaction = BetterSQLite3Database<DbSchema>;

export interface SourceDocumentLedgerEntryInsert {
  id?: string;
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string;
  amount: string;
  currency: string;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
}

export async function getEntryCategoryName(categoryId: string | null): Promise<string> {
  if (categoryId == null || categoryId === "") {
    return "";
  }

  const category = await db.query.entryCategories.findFirst({
    where: and(eq(entryCategories.id, categoryId), isNull(entryCategories.deletedAt)),
    columns: { name: true },
  });

  return category?.name ?? "";
}

export function softDeleteLedgerEntriesForSourceDocuments(
  tx: LedgerTransaction,
  ledgerId: string,
  sourceDocumentIds: string[]
): void {
  if (sourceDocumentIds.length === 0) {
    return;
  }

  const q = forLedger(ledgerEntries, ledgerId);

  tx.update(ledgerEntries)
    .set(q.softDelete)
    .where(and(q.whereActive, inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)))
    .run();
}

export function replaceLedgerEntriesForSourceDocument(
  tx: LedgerTransaction,
  ledgerId: string,
  sourceDocumentId: string,
  entriesToInsert: SourceDocumentLedgerEntryInsert[]
): void {
  softDeleteLedgerEntriesForSourceDocuments(tx, ledgerId, [sourceDocumentId]);

  if (entriesToInsert.length > 0) {
    tx.insert(ledgerEntries).values(entriesToInsert).run();
  }
}

export function insertLedgerEntryForSourceDocument(
  tx: LedgerTransaction,
  entry: SourceDocumentLedgerEntryInsert
): void {
  tx.insert(ledgerEntries).values(entry).run();
}
