import { and, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import type * as schemaModule from "@/persistence";

// Legacy result projection used only by the in-process compatibility adapter.

type DbSchema = typeof schemaModule;

export type SourceDocumentTransaction = BetterSQLite3Database<DbSchema>;

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

export function softDeleteSourceDocumentLedgerEntries(
  tx: SourceDocumentTransaction,
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

export function replaceSourceDocumentLedgerEntries(
  tx: SourceDocumentTransaction,
  ledgerId: string,
  sourceDocumentId: string,
  entriesToInsert: SourceDocumentLedgerEntryInsert[]
): void {
  softDeleteSourceDocumentLedgerEntries(tx, ledgerId, [sourceDocumentId]);

  if (entriesToInsert.length > 0) {
    tx.insert(ledgerEntries).values(entriesToInsert).run();
  }
}

export function insertSourceDocumentLedgerEntry(
  tx: SourceDocumentTransaction,
  entry: SourceDocumentLedgerEntryInsert
): void {
  tx.insert(ledgerEntries).values(entry).run();
}
