import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  duplicateReviews,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import type { VersionedCommandResult, VersionedTarget } from "@/modules/source-document/contracts";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
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
  return softDeleteLockedSourceDocument(tx, ledgerId, document);
}

async function softDeleteLockedSourceDocument(
  tx: PostgresTransaction,
  ledgerId: string,
  document: typeof sourceDocuments.$inferSelect
): Promise<boolean> {
  const sourceDocumentId = document.id;
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
    .set({
      pendingRevisionId: null,
      currentStatus: "cancelled",
      deletedAt: now,
      stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
      updatedAt: now,
    })
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

export async function deleteSourceDocumentAtomically(input: {
  ledgerId: string;
  target: VersionedTarget;
}): Promise<VersionedCommandResult<DeleteSourceDocumentResultDto>> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, input.ledgerId);
    const document = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.target.sourceDocumentId
    );
    if (document.stateVersion !== input.target.expectedVersion) {
      return {
        ok: false,
        reason: "stale",
        sourceDocumentId: input.target.sourceDocumentId,
        expectedVersion: input.target.expectedVersion,
        currentVersion: document.stateVersion,
      };
    }
    const deleted = await softDeleteLockedSourceDocument(tx, input.ledgerId, document);
    if (!deleted) throw new NotFoundError("Source document");
    return {
      ok: true,
      sourceDocumentId: input.target.sourceDocumentId,
      version: input.target.expectedVersion + 1,
      data: { sourceDocumentId: input.target.sourceDocumentId, deleted: true },
    };
  });
}
