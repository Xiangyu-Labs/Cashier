import { and, eq, isNull, ne } from "drizzle-orm";
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
    ne(sourceDocuments.status, DELETED_SOURCE_DOCUMENT_STATUS),
    isNull(sourceDocuments.deletedAt)
  )!;
}

export async function deleteLedger(userId: string, ledgerId: string): Promise<void> {
  const activeOwnedLedger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
  });

  if (activeOwnedLedger == null) {
    const deletedOwnedLedger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId)),
      columns: { id: true, deletedAt: true },
    });

    if (deletedOwnedLedger != null) {
      return;
    }

    const foreignLedger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
      columns: { id: true },
    });

    if (foreignLedger != null) {
      throw new ForbiddenError("Access denied to this ledger");
    }

    throw new NotFoundError("Ledger");
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
