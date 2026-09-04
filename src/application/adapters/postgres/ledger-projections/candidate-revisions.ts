import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  LedgerProjectionEntryContract,
  ProcessingLeaseContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import {
  duplicateReviews,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { transitionSourceDocument } from "@/modules/source-document/application/source-document-state";
import { completeProcessingLeaseInTransaction } from "../processing-terminal";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "../transaction-locks";
import {
  assertExpectedSourceDocumentVersion,
  hasActiveDuplicateReviewPending,
  ledgerScopedRevisionWhere,
} from "./revision-guards";
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
      .where(and(ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, revisionId)))
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
    assertExpectedSourceDocumentVersion(sourceDocumentId, expectedVersion, document.stateVersion);
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
          ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, candidateRevisionId),
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
    assertExpectedSourceDocumentVersion(sourceDocumentId, expectedVersion, document.stateVersion);
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
          ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, candidateRevisionId),
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
