import { and, eq, isNull, sql } from "drizzle-orm";
import type {
  LedgerProjectionEntryContract,
  ProcessingLeaseContract,
} from "@/application/contracts";
import { LedgerMainCurrencyChangedError } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { duplicateReviews, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { transitionSourceDocument } from "@/modules/source-document/application/source-document-state";
import { completeProcessingLeaseInTransaction } from "../processing-terminal";
import {
  lockLedgerForUpdate,
  lockSourceDocumentForUpdate,
  type PostgresTransaction,
} from "../transaction-locks";
import { assertExpectedSourceDocumentVersion, ledgerScopedRevisionWhere } from "./revision-guards";
import {
  activeDocumentWhere,
  assertCategoryOwnership,
  assertEntryValues,
  insertRevisionEntries,
} from "./shared";
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
  expectedMainCurrency: string,
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
    const ledger = await lockLedgerForUpdate(tx, ledgerId);
    if (ledger.mainCurrency !== expectedMainCurrency) {
      throw new LedgerMainCurrencyChangedError();
    }
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.pendingRevisionId !== revisionId || document.activeRevisionId != null) {
      return false;
    }
    const revision = await tx
      .select()
      .from(sourceDocumentRevisions)
      .where(and(ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, revisionId)))
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
    assertExpectedSourceDocumentVersion(sourceDocumentId, expectedVersion, document.stateVersion);
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
          ledgerScopedRevisionWhere(ledgerId, sourceDocumentId, revisionId),
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
    assertExpectedSourceDocumentVersion(sourceDocumentId, expectedVersion, document.stateVersion);
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
