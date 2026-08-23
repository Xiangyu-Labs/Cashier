import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  duplicateReviews,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { NotFoundError } from "@/lib/errors";
import type { PostgresTransaction } from "./transaction-locks";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";

export async function softDeleteSourceDocumentInTransaction(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string
): Promise<boolean> {
  await lockLedgerForUpdate(tx, ledgerId);
  let document: typeof sourceDocuments.$inferSelect;
  try {
    document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
  const now = new Date();
  if (document.pendingRevisionId != null) {
    await tx
      .update(sourceDocumentRevisions)
      .set({ outcome: "cancelled", finalizedAt: now })
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.id, document.pendingRevisionId),
          eq(sourceDocumentRevisions.outcome, "processing")
        )
      );
  }
  await tx
    .update(processingOutbox)
    .set({ status: "cancelled", completedAt: now, claimToken: null, claimExpiresAt: null })
    .where(
      and(
        eq(processingOutbox.ledgerId, ledgerId),
        eq(processingOutbox.sourceDocumentId, sourceDocumentId),
        inArray(processingOutbox.status, ["pending", "claimed"])
      )
    );
  await tx
    .update(processingAttempts)
    .set({ status: "cancelled", completedAt: now, diagnosticCode: "source_document_deleted" })
    .where(
      and(
        eq(processingAttempts.ledgerId, ledgerId),
        inArray(processingAttempts.status, ["queued", "processing"]),
        inArray(
          processingAttempts.revisionId,
          tx
            .select({ id: sourceDocumentRevisions.id })
            .from(sourceDocumentRevisions)
            .where(
              and(
                eq(sourceDocumentRevisions.ledgerId, ledgerId),
                eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId)
              )
            )
        )
      )
    );
  await tx
    .update(duplicateReviews)
    .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
    .where(
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
        inArray(duplicateReviews.status, ["pending", "staged"])
      )
    );
  const deleted = await tx
    .update(sourceDocuments)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .returning({ id: sourceDocuments.id });
  if (deleted.length === 0) return false;
  await tx
    .update(ledgerEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        isNull(ledgerEntries.deletedAt)
      )
    );
  return true;
}
