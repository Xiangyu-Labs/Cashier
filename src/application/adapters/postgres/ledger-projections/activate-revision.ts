import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type {
  LedgerProjectionEntryContract,
  ProcessingLeaseContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import {
  duplicateReviews,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "../transaction-locks";
import { completeProcessingLeaseInTransaction } from "../processing-terminal";

import {
  activeDocumentWhere,
  assertCategoryOwnership,
  assertEntryValues,
  insertRevisionEntries,
} from "./shared";

/**
 * Store a completed but non-activated revision candidate.
 * Inserts ledger entries linked to the candidate revision and marks the revision as completed,
 * but does NOT update activeRevisionId or clear pendingRevisionId on the document.
 *
 * When `duplicateReview` is provided the same transaction also stores a
 * `staged` duplicate review: the retry candidate was detected as a duplicate,
 * but the user has not accepted the candidate yet, so the document remains
 * `candidate_pending` and the review is not surfaced anywhere.
 */
export async function storeCandidateRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string,
  title: string | null | undefined,
  entries: readonly LedgerProjectionEntryContract[],
  lease?: ProcessingLeaseContract,
  duplicateReview?: {
    matchedSourceDocumentId: string;
    matchedRevisionId: string;
    matchedTitle: string | null;
    matchedEntryDate: string | null;
    matchedCreatedAt: string;
    reason: string | null;
    confidence: number | null;
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.pendingRevisionId !== revisionId) return false;

    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, revisionId)
        )
      )
      .for("update")
      .then((rows) => rows[0]);
    if (revision == null || revision.outcome !== "processing") {
      return false;
    }
    if (!(await completeProcessingLeaseInTransaction(tx, lease, "completed"))) return false;

    const now = new Date();
    assertEntryValues(entries);
    await assertCategoryOwnership(tx, ledgerId, entries);
    await insertRevisionEntries(tx, { ledgerId, sourceDocumentId, revisionId, entries });
    await tx
      .update(sourceDocumentRevisions)
      .set({
        title: title ?? null,
        outcome: "completed",
        finalizedAt: now,
        anomalyReason: null,
        failureCode: null,
      })
      .where(eq(sourceDocumentRevisions.id, revisionId));
    if (duplicateReview != null) {
      await tx
        .insert(duplicateReviews)
        .values({
          ledgerId,
          sourceDocumentId,
          revisionId,
          matchedSourceDocumentId: duplicateReview.matchedSourceDocumentId,
          matchedRevisionId: duplicateReview.matchedRevisionId,
          matchedTitle: duplicateReview.matchedTitle,
          matchedEntryDate: duplicateReview.matchedEntryDate,
          matchedCreatedAt: new Date(duplicateReview.matchedCreatedAt),
          status: "staged",
          reason: duplicateReview.reason,
          confidence:
            duplicateReview.confidence == null ? null : String(duplicateReview.confidence),
        })
        .onConflictDoNothing({
          target: [duplicateReviews.sourceDocumentId, duplicateReviews.revisionId],
        });
    }
    // The candidate title is committed only if this revision is accepted.
    return true;
  });
}

/**
 * Store a completed, active revision for a first parse that was flagged as a
 * likely duplicate. The pending review keeps the document in
 * `duplicate_pending`, while the active projection makes the bill visible to
 * all normal accounting reads until it is discarded.
 */
export async function storeDuplicatePendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string,
  title: string | null | undefined,
  entries: readonly LedgerProjectionEntryContract[],
  review: {
    matchedSourceDocumentId: string;
    matchedRevisionId: string;
    matchedTitle: string | null;
    matchedEntryDate: string | null;
    matchedCreatedAt: string;
    reason: string | null;
    confidence: number | null;
  },
  lease?: ProcessingLeaseContract
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.pendingRevisionId !== revisionId || document.activeRevisionId != null) {
      return false;
    }
    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, revisionId)
        )
      )
      .for("update")
      .then((rows) => rows[0]);
    if (revision == null || revision.outcome !== "processing") return false;
    if (!(await completeProcessingLeaseInTransaction(tx, lease, "completed"))) return false;

    const now = new Date();
    assertEntryValues(entries);
    await assertCategoryOwnership(tx, ledgerId, entries);
    await insertRevisionEntries(tx, { ledgerId, sourceDocumentId, revisionId, entries });
    await tx
      .update(sourceDocumentRevisions)
      .set({
        title: title ?? null,
        outcome: "completed",
        finalizedAt: now,
        anomalyReason: null,
        failureCode: null,
      })
      .where(eq(sourceDocumentRevisions.id, revisionId));
    const insertedReview = await tx
      .insert(duplicateReviews)
      .values({
        ledgerId,
        sourceDocumentId,
        revisionId,
        matchedSourceDocumentId: review.matchedSourceDocumentId,
        matchedRevisionId: review.matchedRevisionId,
        matchedTitle: review.matchedTitle,
        matchedEntryDate: review.matchedEntryDate,
        matchedCreatedAt: new Date(review.matchedCreatedAt),
        status: "pending",
        reason: review.reason,
        confidence: review.confidence == null ? null : String(review.confidence),
      })
      .onConflictDoNothing({
        target: [duplicateReviews.sourceDocumentId, duplicateReviews.revisionId],
      })
      .returning({ id: duplicateReviews.id })
      .then((rows) => rows[0]);
    if (insertedReview == null) {
      throw new ConflictError("Duplicate review already exists");
    }
    // Activate the completed projection before touching the document. The
    // status trigger checks the pending review first, so this produces an
    // active `duplicate_pending` document rather than a plain completed one.
    const activated = await tx
      .update(sourceDocuments)
      .set({
        activeRevisionId: revisionId,
        pendingRevisionId: null,
        ...(title == null ? {} : { title }),
        updatedAt: now,
      })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.pendingRevisionId, revisionId),
          isNull(sourceDocuments.activeRevisionId)
        )
      )
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (activated == null) {
      throw new ConflictError("Source document changed during duplicate activation");
    }
    return true;
  });
}

/**
 * Keep a duplicate-pending document: mark the review as kept and refresh the
 * document status. The active projection is already in place, so this must
 * never insert entries or activate a second revision.
 */
export async function activateDuplicatePendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    let document: typeof sourceDocuments.$inferSelect;
    try {
      document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
    if (document.deletedAt != null) return false;
    const review = await tx
      .select()
      .from(duplicateReviews)
      .where(
        and(
          eq(duplicateReviews.ledgerId, ledgerId),
          eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
          eq(duplicateReviews.revisionId, revisionId)
        )
      )
      .then((rows) => rows[0]);
    if (review == null) {
      throw new ConflictError("Duplicate review record is missing");
    }
    if (
      review.status === "kept" &&
      review.revisionId === revisionId &&
      document.activeRevisionId === revisionId &&
      document.pendingRevisionId == null
    ) {
      return true;
    }
    if (review.status !== "pending" || review.revisionId !== revisionId) {
      throw new ConflictError("Duplicate review is no longer pending");
    }
    if (document.activeRevisionId !== revisionId || document.pendingRevisionId != null) {
      throw new ConflictError("Duplicate active revision does not match");
    }

    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, revisionId),
          eq(sourceDocumentRevisions.outcome, "completed")
        )
      )
      .then((rows) => rows[0]);
    if (revision == null) {
      throw new ConflictError("Duplicate pending revision is not completed");
    }

    const now = new Date();
    // Decide the review BEFORE touching the document so the status trigger
    // computes `completed` instead of `duplicate_pending`.
    await tx
      .update(duplicateReviews)
      .set({ status: "kept", decision: "keep_duplicate", decidedAt: now, updatedAt: now })
      .where(eq(duplicateReviews.id, review.id));
    const updated = await tx
      .update(sourceDocuments)
      .set({ updatedAt: now })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.activeRevisionId, revisionId),
          isNull(sourceDocuments.pendingRevisionId)
        )
      )
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (updated == null) {
      throw new ConflictError("Source document changed during duplicate keep");
    }
    return true;
  });
}

/**
 * Discard a duplicate-pending document: mark the review as discarded and
 * soft-delete the active new document. Its active entries remain historical
 * rows, but all accounting reads exclude them through the document tombstone.
 * Idempotent.
 */
export async function discardDuplicatePendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await tx
      .select()
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.ledgerId, ledgerId), eq(sourceDocuments.id, sourceDocumentId)))
      .for("update")
      .then((rows) => rows[0]);
    if (document == null) return false;

    const review = await tx
      .select()
      .from(duplicateReviews)
      .where(
        and(
          eq(duplicateReviews.ledgerId, ledgerId),
          eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
          eq(duplicateReviews.revisionId, revisionId)
        )
      )
      .then((rows) => rows[0]);
    if (
      review != null &&
      review.status === "discarded" &&
      review.decision === "discard_duplicate" &&
      review.revisionId === revisionId
    ) {
      return true;
    }
    if (document.deletedAt != null) return false;
    if (review == null || review.status !== "pending" || review.revisionId !== revisionId) {
      throw new ConflictError("Duplicate review is no longer pending");
    }
    if (document.activeRevisionId !== revisionId || document.pendingRevisionId != null) {
      throw new ConflictError("Duplicate active revision does not match");
    }

    const now = new Date();
    await tx
      .update(duplicateReviews)
      .set({ status: "discarded", decision: "discard_duplicate", decidedAt: now, updatedAt: now })
      .where(eq(duplicateReviews.id, review.id));
    const deleted = await tx
      .update(sourceDocuments)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.activeRevisionId, revisionId),
          isNull(sourceDocuments.pendingRevisionId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (deleted == null) {
      throw new ConflictError("Source document changed during duplicate discard");
    }
    return true;
  });
}

/**
 * Accept a candidate revision: replace the active projection with the candidate's entries
 * and update document pointers.
 *
 * Two-phase duplicate review: when the candidate carries a `staged` duplicate
 * review (the retry was detected as a duplicate), the previous pending review
 * is superseded, the staged review is promoted to `pending`, and the document
 * becomes `duplicate_pending`. Otherwise the candidate is accepted as a normal
 * completed document. Returns the resulting document status.
 *
 * Acquires a source-document row lock to serialise concurrent operations on the same document.
 * Throws {@link ConflictError} when pointer ownership or CAS checks fail so the entire
 * transaction (including soft-deletes) rolls back.
 */
export async function acceptCandidateRevision(
  ledgerId: string,
  sourceDocumentId: string,
  candidateRevisionId: string
): Promise<"completed" | "duplicate_pending"> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);

    // Idempotent: candidate is already active
    if (document.activeRevisionId === candidateRevisionId && document.pendingRevisionId == null) {
      const review = await tx
        .select({ status: duplicateReviews.status })
        .from(duplicateReviews)
        .where(
          and(
            eq(duplicateReviews.ledgerId, ledgerId),
            eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
            eq(duplicateReviews.revisionId, candidateRevisionId),
            eq(duplicateReviews.status, "pending")
          )
        )
        .then((rows) => rows[0]);
      return review == null ? "completed" : "duplicate_pending";
    }

    // Re-read pointers inside the lock — reject stale CAS on the spot.
    if (document.pendingRevisionId !== candidateRevisionId || document.activeRevisionId == null) {
      throw new ConflictError(
        "Cannot accept candidate: pending revision does not match or no active revision exists"
      );
    }

    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, candidateRevisionId),
          eq(sourceDocumentRevisions.outcome, "completed")
        )
      )
      .then((rows) => rows[0]);
    if (revision == null) {
      throw new ConflictError("Candidate revision is not completed");
    }

    const now = new Date();
    // Promote the staged review (if any) BEFORE updating the document pointers
    // so the status trigger observes a pending review for the new active
    // revision and computes `duplicate_pending`.
    const stagedReview = await tx
      .select({ id: duplicateReviews.id })
      .from(duplicateReviews)
      .where(
        and(
          eq(duplicateReviews.ledgerId, ledgerId),
          eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
          eq(duplicateReviews.revisionId, candidateRevisionId),
          eq(duplicateReviews.status, "staged")
        )
      )
      .then((rows) => rows[0]);

    // Supersede the previous pending review first: it belongs to the old
    // active revision and must never stay pending after the swap.
    await tx
      .update(duplicateReviews)
      .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(duplicateReviews.ledgerId, ledgerId),
          eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
          eq(duplicateReviews.status, "pending"),
          eq(duplicateReviews.revisionId, document.activeRevisionId)
        )
      );

    if (stagedReview != null) {
      await tx
        .update(duplicateReviews)
        .set({ status: "pending", decision: null, decidedAt: null, updatedAt: now })
        .where(eq(duplicateReviews.id, stagedReview.id));
    }

    // Soft-delete the old active revision's entries (safe: lock guards against concurrent mutation)
    await tx
      .update(ledgerEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
          isNull(ledgerEntries.deletedAt)
        )
      );

    // Update document pointers with a final CAS check.
    // With the source-document lock this should always succeed, but the guard catches
    // programming errors and ensures the transaction rolls back on failure.
    const updated = await tx
      .update(sourceDocuments)
      .set({
        activeRevisionId: candidateRevisionId,
        pendingRevisionId: null,
        ...(revision.title == null || revision.title === "" ? {} : { title: revision.title }),
        updatedAt: now,
      })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.pendingRevisionId, candidateRevisionId),
          isNotNull(sourceDocuments.activeRevisionId)
        )
      )
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (updated == null) {
      throw new ConflictError("Source document was modified concurrently during accept");
    }
    return stagedReview == null ? "completed" : "duplicate_pending";
  });
}

/**
 * Abandon a candidate revision: mark the revision as abandoned and clear pendingRevisionId
 * without touching the active projection.
 *
 * Acquires a source-document row lock to serialise concurrent operations on the same document.
 * Throws {@link ConflictError} when pointer ownership or CAS checks fail so the entire
 * transaction (including the revision outcome change) rolls back.
 */
export async function abandonCandidateRevision(
  ledgerId: string,
  sourceDocumentId: string,
  candidateRevisionId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);

    // Idempotent: candidate revision is already abandoned (pendingRevisionId cleared)
    if (document.pendingRevisionId == null) {
      const revision = await tx
        .select()
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
            eq(sourceDocumentRevisions.id, candidateRevisionId),
            eq(sourceDocumentRevisions.outcome, "abandoned")
          )
        )
        .then((rows) => rows[0]);
      if (revision != null) return true;
    }

    // Re-read pointers inside the lock — reject stale CAS on the spot.
    if (document.pendingRevisionId !== candidateRevisionId) {
      throw new ConflictError("Cannot abandon candidate: pending revision does not match");
    }
    if (document.activeRevisionId == null) {
      throw new ConflictError("Cannot abandon candidate without an active result");
    }

    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, candidateRevisionId),
          inArray(sourceDocumentRevisions.outcome, ["completed", "anomaly", "failed"])
        )
      )
      .then((rows) => rows[0]);
    if (revision == null) {
      throw new ConflictError("Pending revision cannot be abandoned");
    }

    const now = new Date();
    // A staged duplicate review belongs to the candidate revision being
    // abandoned: it can never be promoted once the candidate is rejected.
    // The old active revision's pending review is deliberately left intact so
    // the status trigger restores `duplicate_pending` when applicable.
    await tx
      .update(duplicateReviews)
      .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(duplicateReviews.ledgerId, ledgerId),
          eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
          eq(duplicateReviews.revisionId, candidateRevisionId),
          eq(duplicateReviews.status, "staged")
        )
      );

    // Mark the revision as abandoned (safe: lock guards against concurrent mutation).
    // CAS: a completed, anomalous, or failed retry can be abandoned.
    const revisionUpdated = await tx
      .update(sourceDocumentRevisions)
      .set({ outcome: "abandoned", finalizedAt: now })
      .where(
        and(
          eq(sourceDocumentRevisions.id, candidateRevisionId),
          inArray(sourceDocumentRevisions.outcome, ["completed", "anomaly", "failed"])
        )
      )
      .returning({ id: sourceDocumentRevisions.id })
      .then((rows) => rows[0]);
    if (revisionUpdated == null) {
      throw new ConflictError("Revision outcome changed during abandon");
    }

    // Clear the pending pointer. With the source-document lock this should always succeed,
    // but the WHERE guard catches programming errors and ensures rollback.
    const documentUpdated = await tx
      .update(sourceDocuments)
      .set({ pendingRevisionId: null, updatedAt: now })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.pendingRevisionId, candidateRevisionId)
        )
      )
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (documentUpdated == null) {
      throw new ConflictError("Source document was modified concurrently during abandon");
    }
    return true;
  });
}

export interface CancelPendingRevisionResult {
  sourceDocumentId: string;
  revisionId: string;
  status: "cancelled" | "abandoned";
  restoredActiveResult: boolean;
}

/** Stop accepting results for a pending revision without interrupting provider I/O. */
export async function cancelPendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string
): Promise<CancelPendingRevisionResult> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    const revision = await tx
      .select({ outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          eq(sourceDocumentRevisions.id, revisionId)
        )
      )
      .then((rows) => rows[0]);
    if (revision == null) throw new NotFoundError("Source document revision");

    const restoredActiveResult = document.activeRevisionId != null;
    if (
      (revision.outcome === "cancelled" || revision.outcome === "abandoned") &&
      (document.pendingRevisionId == null || document.pendingRevisionId === revisionId)
    ) {
      return { sourceDocumentId, revisionId, status: revision.outcome, restoredActiveResult };
    }
    if (document.pendingRevisionId !== revisionId) {
      throw new ConflictError("Cannot cancel processing: pending revision does not match");
    }

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
      // stays untouched so it can be restored by the status trigger.
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

    if (restoredActiveResult) {
      const documentUpdated = await tx
        .update(sourceDocuments)
        .set({ pendingRevisionId: null, updatedAt: now })
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
    } else {
      await tx
        .update(sourceDocuments)
        .set({ updatedAt: now })
        .where(
          and(
            activeDocumentWhere(ledgerId, sourceDocumentId),
            eq(sourceDocuments.pendingRevisionId, revisionId)
          )
        );
    }

    return { sourceDocumentId, revisionId, status: nextOutcome, restoredActiveResult };
  });
}
