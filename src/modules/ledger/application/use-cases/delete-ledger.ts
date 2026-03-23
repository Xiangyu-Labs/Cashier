import { and, eq, ne } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";

const DELETED_SOURCE_DOCUMENT_STATUS = "deleted";

function deletedSourceDocumentPatch(now = new Date()) {
  return {
    status: DELETED_SOURCE_DOCUMENT_STATUS,
    deletedAt: now,
    updatedAt: now,
  } as const;
}

function whereLedgerSourceDocumentNotDeleted(ledgerId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    ne(sourceDocuments.status, DELETED_SOURCE_DOCUMENT_STATUS)
  )!;
}

export async function deleteLedger(userId: string, ledgerId: string): Promise<void> {
  const existing = await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
  });

  if (existing == null) {
    throw new NotFoundError("Ledger");
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError("Access denied to this ledger");
  }

  if (existing.deletedAt != null) {
    return;
  }

  const qEntries = forLedger(ledgerEntries, ledgerId);
  const qCategories = forLedger(entryCategories, ledgerId);

  db.transaction((tx) => {
    tx.update(ledgerEntries).set(qEntries.softDelete).where(qEntries.whereActive).run();
    tx.update(entryCategories).set(qCategories.softDelete).where(qCategories.whereActive).run();
    tx.update(sourceDocuments)
      .set(deletedSourceDocumentPatch())
      .where(whereLedgerSourceDocumentNotDeleted(ledgerId))
      .run();
    tx.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, ledgerId)).run();
  });

  updateTag("ledger");
}
