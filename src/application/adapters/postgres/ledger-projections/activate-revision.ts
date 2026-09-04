import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  LedgerProjectionEntryContract,
  ProcessingLeaseContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, StaleSourceDocumentVersionError } from "@/lib/errors";
import {
  duplicateReviews,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import {
  lockLedgerForUpdate,
  lockSourceDocumentForUpdate,
  type PostgresTransaction,
} from "../transaction-locks";
import { completeProcessingLeaseInTransaction } from "../processing-terminal";
import { transitionSourceDocument } from "@/modules/source-document/application/source-document-state";

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
    const { state: candidateState } = transitionSourceDocument(
      { status: "processing", hasActiveResult: true },
      { type: "processing_candidate_succeeded" }
    );
    await tx
      .update(sourceDocuments)
      .set({
        currentStatus: candidateState.status,
        stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          activeDocumentWhere(ledgerId, sourceDocumentId),
          eq(sourceDocuments.pendingRevisionId, revisionId)
        )
      );
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
    // application transaction sets `currentStatus` to `duplicate_pending`
    // explicitly below, after the pending review row above is already
    // inserted, so the two writes stay consistent within this transaction.
    const { state: duplicatePendingState } = transitionSourceDocument(
      { status: "processing", hasActiveResult: false },
      { type: "processing_succeeded", duplicate: true }
    );
    const activated = await tx
      .update(sourceDocuments)
      .set({
        activeRevisionId: revisionId,
        pendingRevisionId: null,
        currentStatus: duplicatePendingState.status,
        stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
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
async function updateResolvedDuplicateDocument(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId: string;
    now: Date;
    resolution: "keep" | "discard";
  }
) {
  const { state: keptState } = transitionSourceDocument(
    { status: "duplicate_pending", hasActiveResult: true },
    { type: "keep_duplicate" }
  );
  const updated = await tx
    .update(sourceDocuments)
    .set(
      input.resolution === "keep"
        ? {
            currentStatus: keptState.status,
            stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
            updatedAt: input.now,
          }
        : {
            deletedAt: input.now,
            stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
            updatedAt: input.now,
          }
    )
    .where(
      and(
        activeDocumentWhere(input.ledgerId, input.sourceDocumentId),
        eq(sourceDocuments.activeRevisionId, input.revisionId),
        isNull(sourceDocuments.pendingRevisionId)
      )
    )
    .returning({ id: sourceDocuments.id })
    .then((rows) => rows[0]);
  if (updated == null) {
    throw new ConflictError(`Source document changed during duplicate ${input.resolution}`);
  }
}

/** Whether the document's active revision still carries an undecided duplicate review. */
async function hasActiveDuplicateReviewPending(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string,
  activeRevisionId: string
): Promise<boolean> {
  const pendingReview = await tx
    .select({ id: duplicateReviews.id })
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
        eq(duplicateReviews.revisionId, activeRevisionId),
        eq(duplicateReviews.status, "pending")
      )
    )
    .then((rows) => rows[0]);
  return pendingReview != null;
}

export async function activateDuplicatePendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  expectedVersion: number
): Promise<{ version: number; status: "completed" } | null> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    let document: typeof sourceDocuments.$inferSelect;
    try {
      document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
    if (document.stateVersion !== expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        sourceDocumentId,
        expectedVersion,
        document.stateVersion
      );
    }
    const revisionId = document.activeRevisionId;
    if (revisionId == null || document.pendingRevisionId != null) {
      throw new ConflictError("Duplicate active revision does not match");
    }
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
      return { version: document.stateVersion, status: "completed" };
    }
    if (review.status !== "pending" || review.revisionId !== revisionId) {
      throw new ConflictError("Duplicate review is no longer pending");
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
    // Decide the review BEFORE touching the document: the application
    // transaction computes `currentStatus` explicitly below, and this
    // ordering keeps that computation observing the resolved review.
    await tx
      .update(duplicateReviews)
      .set({ status: "kept", decision: "keep_duplicate", decidedAt: now, updatedAt: now })
      .where(eq(duplicateReviews.id, review.id));
    await updateResolvedDuplicateDocument(tx, {
      ledgerId,
      sourceDocumentId,
      revisionId,
      now,
      resolution: "keep",
    });
    return { version: document.stateVersion + 1, status: "completed" };
  });
}

/**
 * Discard a duplicate-pending document: mark the review as discarded and
 * soft-delete the active new document. Its active entries remain historical
 * rows, but all accounting reads exclude them through the document tombstone.
 * Idempotent.
 */
/**
 * Locks the raw row (not the deletedAt-filtered helper) because a discard
 * replay at the current version must be able to read the already-tombstoned
 * document to distinguish stale-version conflicts from a no-op replay.
 */
export async function discardDuplicatePendingRevision(
  ledgerId: string,
  sourceDocumentId: string,
  expectedVersion: number
): Promise<{ version: number; status: "deleted" } | null> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await tx
      .select()
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.ledgerId, ledgerId), eq(sourceDocuments.id, sourceDocumentId)))
      .for("update")
      .then((rows) => rows[0]);
    if (document == null) return null;
    if (document.stateVersion !== expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        sourceDocumentId,
        expectedVersion,
        document.stateVersion
      );
    }
    const revisionId = document.activeRevisionId;
    if (revisionId == null || document.pendingRevisionId != null) {
      throw new ConflictError("Duplicate active revision does not match");
    }

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
      return { version: document.stateVersion, status: "deleted" };
    }
    if (document.deletedAt != null) return null;
    if (review == null || review.status !== "pending" || review.revisionId !== revisionId) {
      throw new ConflictError("Duplicate review is no longer pending");
    }
    const now = new Date();
    await tx
      .update(duplicateReviews)
      .set({ status: "discarded", decision: "discard_duplicate", decidedAt: now, updatedAt: now })
      .where(eq(duplicateReviews.id, review.id));
    await updateResolvedDuplicateDocument(tx, {
      ledgerId,
      sourceDocumentId,
      revisionId,
      now,
      resolution: "discard",
    });
    return { version: document.stateVersion + 1, status: "deleted" };
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
  expectedVersion: number
): Promise<{ version: number; status: "completed" | "duplicate_pending" }> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.stateVersion !== expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        sourceDocumentId,
        expectedVersion,
        document.stateVersion
      );
    }
    const candidateRevisionId = document.pendingRevisionId;
    // Re-read pointers inside the lock — reject stale CAS on the spot.
    if (document.activeRevisionId == null || candidateRevisionId == null) {
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
    // Promote the staged review (if any) BEFORE updating the document pointers:
    // the application transaction computes `currentStatus` from the promoted
    // review state directly below, so this ordering keeps that computation correct.
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
    const { state: acceptedState } = transitionSourceDocument(
      { status: "candidate_pending", hasActiveResult: true },
      { type: "accept_candidate", duplicate: stagedReview != null }
    );
    const updated = await tx
      .update(sourceDocuments)
      .set({
        activeRevisionId: candidateRevisionId,
        pendingRevisionId: null,
        currentStatus: acceptedState.status,
        stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
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
    return {
      version: document.stateVersion + 1,
      status: acceptedState.status as "completed" | "duplicate_pending",
    };
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
  expectedVersion: number
): Promise<{ version: number; status: "completed" | "duplicate_pending" } | null> {
  return db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.stateVersion !== expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        sourceDocumentId,
        expectedVersion,
        document.stateVersion
      );
    }
    const candidateRevisionId = document.pendingRevisionId;
    if (candidateRevisionId == null) {
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
    // `hasActiveDuplicateReviewPending` below can restore `duplicate_pending` when applicable.
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
    const activeDuplicateReviewPending = await hasActiveDuplicateReviewPending(
      tx,
      ledgerId,
      sourceDocumentId,
      document.activeRevisionId
    );
    // Derive the pre-abandon status from the candidate revision's own outcome
    // (already verified above) rather than the document row's `currentStatus`
    // column: nothing keeps that column synced to a revision outcome written
    // outside the normal terminal-outcome write path.
    const preAbandonStatus = (
      revision.outcome === "completed" ? "candidate_pending" : revision.outcome
    ) as "candidate_pending" | "anomaly" | "failed";
    const { state: abandonedState } = transitionSourceDocument(
      { status: preAbandonStatus, hasActiveResult: true },
      { type: "abandon_candidate", activeDuplicateReviewPending }
    );
    const documentUpdated = await tx
      .update(sourceDocuments)
      .set({
        pendingRevisionId: null,
        currentStatus: abandonedState.status,
        stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
        updatedAt: now,
      })
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
    return {
      version: document.stateVersion + 1,
      status: abandonedState.status as "completed" | "duplicate_pending",
    };
  });
}

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
    if (document.stateVersion !== expectedVersion) {
      throw new StaleSourceDocumentVersionError(
        sourceDocumentId,
        expectedVersion,
        document.stateVersion
      );
    }
    const revisionId = document.pendingRevisionId;
    if (revisionId == null) {
      throw new ConflictError("Source document has no pending revision");
    }
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
