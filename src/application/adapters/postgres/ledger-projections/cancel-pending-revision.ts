import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import {
  duplicateReviews,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { transitionSourceDocument } from "@/modules/source-document/application/source-document-state";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "../transaction-locks";
import {
  assertExpectedSourceDocumentVersion,
  hasActiveDuplicateReviewPending,
  ledgerScopedRevisionWhere,
} from "./revision-guards";
import { activeDocumentWhere } from "./shared";
export interface CancelPendingRevisionResult {
  version: number;
  status: "cancelled" | "completed" | "duplicate_pending";
}

/** Stop accepting results for a pending revision without interrupting provider I/O. */
export async function cancelPendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  expectedVersion: number
): Promise<CancelPendingRevisionResult> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    assertExpectedSourceDocumentVersion(sourceDocumentId, expectedVersion, document.stateVersion);
    const revisionId = document.pendingRevisionId;
    if (revisionId == null) {
      throw new ConflictError("Source document has no pending revision");
    }
    const revision = await tx
      .select({ outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(and(ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, revisionId)))
      .then((rows) => rows[0]);
    if (revision == null) throw new NotFoundError("Source document revision");

    const restoredActiveResult = document.activeRevisionId != null;
    const canAbandonFinishedCandidate =
      restoredActiveResult && ["completed", "anomaly", "failed"].includes(revision.outcome);
    if (revision.outcome !== "processing" && !canAbandonFinishedCandidate) {
      throw new ConflictError("Processing already reached a final state");
    }

    const now = new Date();
    const nextOutcome = canAbandonFinishedCandidate ? "abandoned" : "cancelled";
    if (canAbandonFinishedCandidate) {
      // The candidate's staged duplicate review can never be promoted once
      // the candidate is abandoned; the old active revision's pending review
      // stays untouched so `hasActiveDuplicateReviewPending` below can restore it.
      await tx
        .update(duplicateReviews)
        .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(duplicateReviews.ledgerId, ledgerId),
            eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
            eq(duplicateReviews.revisionId, revisionId),
            eq(duplicateReviews.status, "staged")
          )
        );
    }
    const revisionUpdated = await tx
      .update(sourceDocumentRevisions)
      .set({ outcome: nextOutcome, finalizedAt: now })
      .where(
        and(
          eq(sourceDocumentRevisions.id, revisionId),
          canAbandonFinishedCandidate
            ? inArray(sourceDocumentRevisions.outcome, ["completed", "anomaly", "failed"])
            : eq(sourceDocumentRevisions.outcome, "processing")
        )
      )
      .returning({ id: sourceDocumentRevisions.id })
      .then((rows) => rows[0]);
    if (revisionUpdated == null) {
      throw new ConflictError("Revision outcome changed during cancellation");
    }

    await tx
      .update(processingOutbox)
      .set({ status: "cancelled", completedAt: now, claimToken: null, claimExpiresAt: null })
      .where(
        and(
          eq(processingOutbox.revisionId, revisionId),
          inArray(processingOutbox.status, ["pending", "claimed"])
        )
      );
    await tx
      .update(processingAttempts)
      .set({ status: "cancelled", completedAt: now })
      .where(
        and(
          eq(processingAttempts.revisionId, revisionId),
          inArray(processingAttempts.status, ["queued", "processing"])
        )
      );

    // Two distinct transitions land here: a still-`processing` revision maps to
    // `cancel_processing`, while a finished-but-undecided candidate being
    // abandoned (`canAbandonFinishedCandidate`) maps to `abandon_candidate` —
    // its precondition is derived from the candidate revision's own outcome
    // (already verified above), not the document row's `currentStatus` column:
    // nothing keeps that column synced to a revision outcome written outside
    // the normal terminal-outcome write path.
    const activeDuplicateReviewPending = restoredActiveResult
      ? await hasActiveDuplicateReviewPending(
          tx,
          ledgerId,
          sourceDocumentId,
          document.activeRevisionId!
        )
      : false;
    const { state: cancelledState } = canAbandonFinishedCandidate
      ? transitionSourceDocument(
          {
            status: (revision.outcome === "completed" ? "candidate_pending" : revision.outcome) as
              "candidate_pending" | "anomaly" | "failed",
            hasActiveResult: true,
          },
          { type: "abandon_candidate", activeDuplicateReviewPending }
        )
      : transitionSourceDocument(
          { status: "processing", hasActiveResult: restoredActiveResult },
          { type: "cancel_processing", activeDuplicateReviewPending }
        );

    let finalStatus: CancelPendingRevisionResult["status"];
    if (restoredActiveResult) {
      const documentUpdated = await tx
        .update(sourceDocuments)
        .set({
          pendingRevisionId: null,
          currentStatus: cancelledState.status,
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            activeDocumentWhere(ledgerId, sourceDocumentId),
            eq(sourceDocuments.pendingRevisionId, revisionId),
            isNotNull(sourceDocuments.activeRevisionId)
          )
        )
        .returning({ id: sourceDocuments.id })
        .then((rows) => rows[0]);
      if (documentUpdated == null) {
        throw new ConflictError("Source document changed during cancellation");
      }
      finalStatus = cancelledState.status as "completed" | "duplicate_pending";
    } else {
      await tx
        .update(sourceDocuments)
        .set({
          pendingRevisionId: null,
          currentStatus: cancelledState.status,
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            activeDocumentWhere(ledgerId, sourceDocumentId),
            eq(sourceDocuments.pendingRevisionId, revisionId)
          )
        );
      finalStatus = "cancelled";
    }

    return { version: document.stateVersion + 1, status: finalStatus };
  });
}
