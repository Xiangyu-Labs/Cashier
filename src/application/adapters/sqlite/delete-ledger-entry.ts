import { and, eq, isNull } from "drizzle-orm";
import {
  ensureTargetLedgerProjection,
  sqliteLedgerProjectionAdapter,
} from "@/application/adapters/sqlite/ledger-projections";
import { db } from "@/lib/db";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import { ledgerEntries } from "@/persistence";

// Current SQLite mutation implementation.

export async function deleteLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string
): Promise<DeleteLedgerEntryResultDto> {
  let target = await db.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.id, ledgerEntryId),
      eq(ledgerEntries.ledgerId, ledgerId),
      isNull(ledgerEntries.deletedAt)
    ),
    with: { sourceDocument: true },
  });
  if (target?.sourceDocument != null && target.sourceDocument.activeRevisionId == null) {
    ensureTargetLedgerProjection(ledgerId, target.sourceDocument.id);
    target = await db.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.id, ledgerEntryId),
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt)
      ),
      with: { sourceDocument: true },
    });
  }
  const document = target?.sourceDocument;
  if (
    target == null ||
    document == null ||
    document.activeRevisionId == null ||
    target.sourceDocumentRevisionId !== document.activeRevisionId
  ) {
    return { ledgerEntryId, deleted: false };
  }
  const entries = await db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      eq(ledgerEntries.sourceDocumentId, document.id),
      eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
      isNull(ledgerEntries.deletedAt)
    ),
    orderBy: (rows, { asc }) => [asc(rows.createdAt), asc(rows.id)],
  });
  await sqliteLedgerProjectionAdapter.replaceActive({
    ledgerId,
    sourceDocumentId: document.id,
    expectedActiveRevisionId: document.activeRevisionId,
    entries: entries
      .filter((entry) => entry.id !== ledgerEntryId)
      .map((entry) => ({
        id: entry.id,
        categoryId: entry.categoryId,
        amount: entry.amount,
        currency: entry.currency,
        itemName: entry.itemName,
        description: entry.description,
        convertedAmount: entry.convertedAmount,
        exchangeRate: entry.exchangeRate,
        createdAt: entry.createdAt.toISOString(),
      })),
  });

  return {
    ledgerEntryId,
    deleted: true,
  };
}
