import { and, eq, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import type {
  LedgerProjectionEntryContract,
  LedgerProjectionEntryFingerprint,
  LedgerProjectionPort,
  ProcessingLeaseContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isValidDecimal } from "@/lib/money/decimal";
import type { SourceDocumentTypeValue } from "@/modules/source-document/types";
import {
  duplicateReviews,
  entryCategories,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import type { PostgresTransaction } from "./transaction-locks";
import { completeProcessingLeaseInTransaction } from "./processing-terminal";
import { softDeleteSourceDocumentInTransaction } from "./source-document-delete";

export class LedgerMainCurrencyChangedError extends ConflictError {
  constructor() {
    super("Ledger currency changed before the entry edit");
  }
}

function activeDocumentWhere(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    eq(sourceDocuments.id, sourceDocumentId),
    isNull(sourceDocuments.deletedAt)
  )!;
}

function sameProjectionFingerprints(
  left: readonly LedgerProjectionEntryFingerprint[],
  right: readonly LedgerProjectionEntryFingerprint[]
): boolean {
  if (left.length !== right.length) return false;
  const sort = (entries: readonly LedgerProjectionEntryFingerprint[]) =>
    [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const expected = sort(left);
  const actual = sort(right);
  return expected.every((entry, index) => {
    const current = actual[index];
    return (
      current != null &&
      current.id === entry.id &&
      current.amount === entry.amount &&
      current.currency === entry.currency &&
      current.sourceDocumentRevisionId === entry.sourceDocumentRevisionId
    );
  });
}

function assertEntryValues(entries: readonly LedgerProjectionEntryContract[]): void {
  for (const entry of entries) {
    if (entry.itemName.trim() === "" || !isValidDecimal(entry.amount)) {
      throw new ValidationError(
        "Ledger projection entries require an item name and numeric amount"
      );
    }
  }
}

async function assertCategoryOwnership(
  tx: PostgresTransaction,
  ledgerId: string,
  entries: readonly LedgerProjectionEntryContract[]
): Promise<void> {
  const categoryIds = [
    ...new Set(entries.flatMap((entry) => (entry.categoryId == null ? [] : [entry.categoryId]))),
  ];
  if (categoryIds.length === 0) return;
  const owned = await tx
    .select({ id: entryCategories.id })
    .from(entryCategories)
    .where(
      and(
        eq(entryCategories.ledgerId, ledgerId),
        inArray(entryCategories.id, categoryIds),
        isNull(entryCategories.deletedAt)
      )
    );
  if (owned.length !== categoryIds.length) {
    throw new NotFoundError("Entry category");
  }
}

async function insertRevisionEntries(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<void> {
  if (input.entries.length === 0) return;
  await tx.insert(ledgerEntries).values(
    input.entries.map((entry, position) => ({
      id: entry.id ?? crypto.randomUUID(),
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentRevisionId: input.revisionId,
      position,
      categoryId: entry.categoryId,
      amount: entry.amount,
      currency: entry.currency,
      itemName: entry.itemName,
      description: entry.description,
      convertedAmount: entry.convertedAmount,
      exchangeRate: entry.exchangeRate,
      ...(entry.createdAt == null ? {} : { createdAt: new Date(entry.createdAt) }),
    }))
  );
}

async function replaceProjection(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<void> {
  assertEntryValues(input.entries);
  await assertCategoryOwnership(tx, input.ledgerId, input.entries);
  const now = new Date();
  await tx
    .update(ledgerEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        isNull(ledgerEntries.deletedAt)
      )
    );
  await insertRevisionEntries(tx, input);
}

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
    if (document == null) throw new NotFoundError("Source document");

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
    if (document.deletedAt != null) throw new NotFoundError("Duplicate review");
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

async function replaceManualProjection(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    previousRevisionId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<void> {
  assertEntryValues(input.entries);
  await assertCategoryOwnership(tx, input.ledgerId, input.entries);
  const requestedIds = input.entries.flatMap((entry) => (entry.id == null ? [] : [entry.id]));
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new ValidationError("A ledger entry may only appear once per manual revision");
  }

  const previousEntries = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.previousRevisionId),
        isNull(ledgerEntries.deletedAt)
      )
    );
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  const foreignRequestedIds = requestedIds.filter((id) => !previousById.has(id));
  if (foreignRequestedIds.length > 0) {
    const existing = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.id, foreignRequestedIds));
    if (existing.length > 0) throw new NotFoundError("Active ledger entry projection");
  }

  const now = new Date();
  const retainedIds = new Set(requestedIds);
  const retainedEntries = previousEntries.filter((previous) => retainedIds.has(previous.id));
  if (retainedEntries.length > 0) {
    // Retained rows move to the new revision in one statement; their positions
    // are appended after the new input entries.
    await tx.execute(sql`
      UPDATE ledger_entries entry
      SET source_document_revision_id = ${input.revisionId},
          position = positions.position + ${input.entries.length},
          updated_at = ${now}
      FROM (VALUES ${sql.join(
        retainedEntries.map((previous, index) => sql`(${previous.id}::uuid, ${index}::integer)`),
        sql`, `
      )}) AS positions(id, position)
      WHERE entry.id = positions.id
        AND entry.ledger_id = ${input.ledgerId}
    `);
  }

  if (retainedEntries.length > 0) {
    // Preserve the historical rows as soft-deleted archives in one insert.
    await tx.insert(ledgerEntries).values(
      retainedEntries.map((previous) => ({
        ...previous,
        id: crypto.randomUUID(),
        deletedAt: now,
        updatedAt: now,
      }))
    );
  }

  const removedIds = previousEntries
    .filter((previous) => !retainedIds.has(previous.id))
    .map((previous) => previous.id);
  if (removedIds.length > 0) {
    await tx
      .update(ledgerEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, removedIds),
          isNull(ledgerEntries.deletedAt)
        )
      );
  }

  const newEntries = input.entries.flatMap((entry, position) => {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    return existing == null
      ? [
          {
            id: entry.id ?? crypto.randomUUID(),
            ledgerId: input.ledgerId,
            sourceDocumentId: input.sourceDocumentId,
            sourceDocumentRevisionId: input.revisionId,
            position,
            categoryId: entry.categoryId,
            amount: entry.amount,
            currency: entry.currency,
            itemName: entry.itemName,
            description: entry.description,
            convertedAmount: entry.convertedAmount,
            exchangeRate: entry.exchangeRate,
            ...(entry.createdAt == null ? {} : { createdAt: new Date(entry.createdAt) }),
          },
        ]
      : [];
  });
  if (newEntries.length > 0) {
    await tx.insert(ledgerEntries).values(newEntries);
  }

  const updatedEntries = input.entries.flatMap((entry, position) => {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    return existing == null
      ? []
      : [
          {
            id: existing.id,
            position,
            categoryId: entry.categoryId,
            amount: entry.amount,
            currency: entry.currency,
            itemName: entry.itemName,
            description: entry.description,
            convertedAmount: entry.convertedAmount,
            exchangeRate: entry.exchangeRate,
          },
        ];
  });
  if (updatedEntries.length > 0) {
    await tx.execute(sql`
      UPDATE ledger_entries entry
      SET source_document_revision_id = ${input.revisionId},
          position = updates.position,
          category_id = updates.category_id,
          amount = updates.amount,
          currency = updates.currency,
          item_name = updates.item_name,
          description = updates.description,
          converted_amount = updates.converted_amount,
          exchange_rate = updates.exchange_rate,
          deleted_at = NULL,
          updated_at = ${now}
      FROM (VALUES ${sql.join(
        updatedEntries.map(
          (row) =>
            sql`(
              ${row.id}::uuid,
              ${row.position}::integer,
              ${row.categoryId}::uuid,
              ${row.amount}::numeric,
              ${row.currency}::varchar(3),
              ${row.itemName}::text,
              ${row.description}::text,
              ${row.convertedAmount}::numeric,
              ${row.exchangeRate}::numeric
            )`
        ),
        sql`, `
      )}) AS updates(id, position, category_id, amount, currency, item_name,
        description, converted_amount, exchange_rate)
      WHERE entry.id = updates.id
        AND entry.ledger_id = ${input.ledgerId}
    `);
  }
}

async function nextRevisionNumber(
  tx: PostgresTransaction,
  sourceDocumentId: string
): Promise<number> {
  const aggregate = await tx
    .select({ value: max(sourceDocumentRevisions.revisionNumber) })
    .from(sourceDocumentRevisions)
    .where(eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId))
    .then((rows) => rows[0]);
  return (aggregate?.value ?? 0) + 1;
}

async function createCompletedRevision(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    submittedText?: string | null;
    revisionId?: string;
  }
) {
  const now = new Date();
  const revisionNumber = await nextRevisionNumber(tx, input.sourceDocumentId);
  const revision = await tx
    .insert(sourceDocumentRevisions)
    .values({
      ...(input.revisionId === undefined ? {} : { id: input.revisionId }),
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      revisionNumber,
      submittedText: input.submittedText ?? null,
      outcome: "completed",
      finalizedAt: now,
      submittedAt: now,
    })
    .returning()
    .then((rows) => rows[0]);
  if (revision == null) throw new ConflictError("Failed to create completed revision");
  return revision;
}

export async function replaceActiveProjectionInTransaction(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedActiveRevisionId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
    title?: string;
    entryDate?: string;
  }
): Promise<string> {
  const pendingDuplicateReview = await tx
    .select({ id: duplicateReviews.id })
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, input.ledgerId),
        eq(duplicateReviews.sourceDocumentId, input.sourceDocumentId),
        eq(duplicateReviews.status, "pending")
      )
    )
    .then((rows) => rows[0]);
  if (pendingDuplicateReview != null) {
    throw new ConflictError("Source document has a pending duplicate review");
  }

  const document = await tx
    .select({
      activeRevisionId: sourceDocuments.activeRevisionId,
      pendingRevisionId: sourceDocuments.pendingRevisionId,
    })
    .from(sourceDocuments)
    .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
    .then((rows) => rows[0]);
  if (
    document?.activeRevisionId == null ||
    document.activeRevisionId !== input.expectedActiveRevisionId
  ) {
    throw new ConflictError("Source document active revision changed");
  }
  if (document.pendingRevisionId != null) {
    const pending = await tx
      .select({ outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
          eq(sourceDocumentRevisions.id, document.pendingRevisionId)
        )
      )
      .then((rows) => rows[0]);
    if (pending?.outcome === "processing" || pending?.outcome === "completed") {
      throw new ConflictError("Source document has processing work");
    }
  }

  const activeRevision = await tx
    .select({ submittedText: sourceDocumentRevisions.submittedText })
    .from(sourceDocumentRevisions)
    .where(
      and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
        eq(sourceDocumentRevisions.id, input.expectedActiveRevisionId),
        eq(sourceDocumentRevisions.outcome, "completed")
      )
    )
    .then((rows) => rows[0]);
  if (activeRevision == null) throw new ConflictError("Active revision is not completed");

  const revision = await createCompletedRevision(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    submittedText: activeRevision.submittedText,
    revisionId: input.revisionId,
  });
  await copyRevisionFiles(tx, {
    ledgerId: input.ledgerId,
    fromRevisionId: input.expectedActiveRevisionId,
    toRevisionId: revision.id,
  });
  await replaceManualProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    previousRevisionId: input.expectedActiveRevisionId,
    revisionId: revision.id,
    entries: input.entries,
  });
  const updated = await tx
    .update(sourceDocuments)
    .set({
      activeRevisionId: revision.id,
      pendingRevisionId: null,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
      updatedAt: new Date(),
    })
    .where(
      and(
        activeDocumentWhere(input.ledgerId, input.sourceDocumentId),
        eq(sourceDocuments.activeRevisionId, input.expectedActiveRevisionId)
      )
    )
    .returning({ id: sourceDocuments.id })
    .then((rows) => rows[0]);
  if (updated == null) throw new ConflictError("Source document changed during the edit");
  return revision.id;
}

export async function ensureTargetLedgerProjection(
  ledgerId: string,
  sourceDocumentId: string
): Promise<string> {
  return db.transaction(async (tx) => {
    // Lock the ledger row to serialise with concurrent main-currency changes.
    await lockLedgerForUpdate(tx, ledgerId);

    // Also lock the source document row to serialise with concurrent soft-delete.
    // Lock order: ledger → source document (prevents deadlocks).
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.activeRevisionId != null) return document.activeRevisionId;
    if (document.currentStatus !== "completed") {
      throw new ConflictError("Source document has no completed active projection");
    }
    throw new ConflictError("Source document is missing its canonical active revision");
  });
}

async function copyRevisionFiles(
  tx: PostgresTransaction,
  input: { ledgerId: string; fromRevisionId: string; toRevisionId: string }
): Promise<void> {
  // The source rows are already tenant-scoped by the WHERE clause, so the
  // copy inherits their ownership in a single INSERT ... SELECT.
  await tx.execute(sql`
    INSERT INTO revision_files (ledger_id, revision_id, stored_file_id, position, created_at)
    SELECT ledger_id, ${input.toRevisionId}, stored_file_id, position, now()
    FROM revision_files
    WHERE ledger_id = ${input.ledgerId}
      AND revision_id = ${input.fromRevisionId}
  `);
}

export async function createCompletedProjectionInTransaction(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId?: string;
    title?: string | null;
    entryDate?: string | null;
    submittedText?: string | null;
    copyFilesFromRevisionId?: string;
    type: SourceDocumentTypeValue;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<string> {
  const existing = await tx
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, input.sourceDocumentId))
    .then((rows) => rows[0]);
  if (existing != null) throw new ConflictError("Source document already exists");

  await tx.insert(sourceDocuments).values({
    id: input.sourceDocumentId,
    ledgerId: input.ledgerId,
    title: input.title ?? null,
    type: input.type,
    currentStatus: "completed",
    entryDate: input.entryDate ?? null,
  });
  const revision = await createCompletedRevision(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    ...(input.revisionId === undefined ? {} : { revisionId: input.revisionId }),
    ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
  });
  if (input.copyFilesFromRevisionId !== undefined) {
    await copyRevisionFiles(tx, {
      ledgerId: input.ledgerId,
      fromRevisionId: input.copyFilesFromRevisionId,
      toRevisionId: revision.id,
    });
  }
  await replaceProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    revisionId: revision.id,
    entries: input.entries,
  });
  await tx
    .update(sourceDocuments)
    .set({ activeRevisionId: revision.id, pendingRevisionId: null })
    .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
  return revision.id;
}

export const postgresLedgerProjectionAdapter: LedgerProjectionPort = {
  async activateRevision(input) {
    return db.transaction(async (tx) => {
      // Lock the ledger row to serialise with concurrent main-currency changes.
      // This is the first-active-projection path; the lock prevents a settings
      // main-currency change from interleaving with entry creation.
      await lockLedgerForUpdate(tx, input.ledgerId);

      // Also lock the source document row to serialise with concurrent soft-delete.
      // Lock order: ledger → source document (prevents deadlocks).
      let document: typeof sourceDocuments.$inferSelect;
      try {
        document = await lockSourceDocumentForUpdate(tx, input.ledgerId, input.sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }
      if (document.pendingRevisionId !== input.revisionId) return false;
      const revision = await tx
        .select()
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId)
          )
        )
        .for("update")
        .then((rows) => rows[0]);
      if (revision == null || revision.outcome !== "processing") {
        return false;
      }
      if (!(await completeProcessingLeaseInTransaction(tx, input.lease, "completed"))) {
        return false;
      }

      await replaceProjection(tx, input);
      const now = new Date();
      await tx
        .update(sourceDocumentRevisions)
        .set({
          title: input.title ?? null,
          outcome: "completed",
          finalizedAt: now,
          anomalyReason: null,
          failureCode: null,
        })
        .where(eq(sourceDocumentRevisions.id, input.revisionId));
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: input.revisionId,
          pendingRevisionId: null,
          ...(input.title == null || input.title === "" ? {} : { title: input.title }),
          updatedAt: now,
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return true;
    });
  },

  async createManual(input) {
    return db.transaction(async (tx) => {
      // Lock the ledger row to serialise with concurrent main-currency changes.
      // This is the first-active-projection path; the lock prevents a settings
      // main-currency change from interleaving with entry creation.
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (ledger.mainCurrency !== input.expectedMainCurrency) {
        throw new ConflictError("Ledger currency changed before quick entry commit");
      }

      const sourceDocumentId = input.sourceDocumentId ?? crypto.randomUUID();
      const revisionId = await createCompletedProjectionInTransaction(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        type: "manual",
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.entryDate !== undefined ? { entryDate: input.entryDate } : {}),
        ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
        entries: input.entries,
      });
      return { sourceDocumentId, revisionId };
    });
  },

  async replaceManual(input) {
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (
        input.expectedMainCurrency !== undefined &&
        ledger.mainCurrency !== input.expectedMainCurrency
      ) {
        throw new ConflictError("Ledger currency changed before the manual edit");
      }
      const document = await lockSourceDocumentForUpdate(
        tx,
        input.ledgerId,
        input.sourceDocumentId
      );
      if (document.type !== "manual" || document.activeRevisionId == null) {
        throw new ConflictError("Source document is not an active manual entry");
      }
      if (
        input.expectedActiveRevisionId !== undefined &&
        document.activeRevisionId !== input.expectedActiveRevisionId
      ) {
        throw new ConflictError("Manual entry changed before the edit was committed");
      }
      if (input.expectedProjection !== undefined) {
        const currentProjection = await tx
          .select({
            id: ledgerEntries.id,
            amount: ledgerEntries.amount,
            currency: ledgerEntries.currency,
            sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
          })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
              isNull(ledgerEntries.deletedAt),
              or(
                eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
                ...(document.pendingRevisionId == null
                  ? []
                  : [eq(ledgerEntries.sourceDocumentRevisionId, document.pendingRevisionId)])
              )
            )
          );
        if (!sameProjectionFingerprints(input.expectedProjection, currentProjection)) {
          throw new ConflictError("Ledger entries changed before the manual edit");
        }
      }
      if (input.projectionConversions !== undefined && input.projectionConversions.length > 0) {
        const changesJson = JSON.stringify(
          input.projectionConversions.map((update) => ({
            id: update.ledgerEntryId,
            converted_amount: update.convertedAmount,
            exchange_rate: update.exchangeRate,
          }))
        );
        const updatedEntries = await tx.execute(sql`
          WITH changes AS (
            SELECT * FROM jsonb_to_recordset(${changesJson}::jsonb) AS value(
              id uuid,
              converted_amount numeric,
              exchange_rate numeric
            )
          )
          UPDATE ledger_entries AS entry
          SET converted_amount = changes.converted_amount,
              exchange_rate = changes.exchange_rate,
              updated_at = ${new Date()}
          FROM changes
          WHERE entry.id = changes.id
            AND entry.ledger_id = ${input.ledgerId}
            AND entry.source_document_id = ${input.sourceDocumentId}
            AND entry.deleted_at IS NULL
          RETURNING entry.id
        `);
        if (updatedEntries.rows.length !== input.projectionConversions.length) {
          throw new ConflictError("Ledger entries changed before the manual edit");
        }
      }
      if (document.pendingRevisionId != null) {
        const pending = await tx
          .select({ outcome: sourceDocumentRevisions.outcome })
          .from(sourceDocumentRevisions)
          .where(eq(sourceDocumentRevisions.id, document.pendingRevisionId))
          .then((rows) => rows[0]);
        if (pending?.outcome === "processing" || pending?.outcome === "completed") {
          throw new ConflictError("Source document has processing work");
        }
      }
      assertEntryValues(input.entries);
      await assertCategoryOwnership(tx, input.ledgerId, input.entries);
      const revision = await createCompletedRevision(tx, input);
      await replaceManualProjection(tx, {
        ...input,
        previousRevisionId: document.activeRevisionId,
        revisionId: revision.id,
      });
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: revision.id,
          pendingRevisionId: null,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
          updatedAt: new Date(),
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return revision.id;
    });
  },

  async replaceActive(input) {
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (
        input.expectedMainCurrency !== undefined &&
        ledger.mainCurrency !== input.expectedMainCurrency
      ) {
        throw new LedgerMainCurrencyChangedError();
      }
      const document = await lockSourceDocumentForUpdate(
        tx,
        input.ledgerId,
        input.sourceDocumentId
      );
      if (
        document.activeRevisionId == null ||
        document.activeRevisionId !== input.expectedActiveRevisionId
      ) {
        throw new ConflictError("Source document active revision changed");
      }
      const pendingDuplicateReview = await tx
        .select({ id: duplicateReviews.id })
        .from(duplicateReviews)
        .where(
          and(
            eq(duplicateReviews.ledgerId, input.ledgerId),
            eq(duplicateReviews.sourceDocumentId, input.sourceDocumentId),
            eq(duplicateReviews.status, "pending")
          )
        )
        .then((rows) => rows[0]);
      if (pendingDuplicateReview != null) {
        throw new ConflictError("Source document has a pending duplicate review");
      }
      if (document.pendingRevisionId != null) {
        const pending = await tx
          .select({ outcome: sourceDocumentRevisions.outcome })
          .from(sourceDocumentRevisions)
          .where(
            and(
              eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
              eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
              eq(sourceDocumentRevisions.id, document.pendingRevisionId)
            )
          )
          .then((rows) => rows[0]);
        if (pending?.outcome === "processing" || pending?.outcome === "completed") {
          throw new ConflictError("Source document has processing work");
        }
      }

      const activeRevision = await tx
        .select({ submittedText: sourceDocumentRevisions.submittedText })
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, document.activeRevisionId),
            eq(sourceDocumentRevisions.outcome, "completed")
          )
        )
        .then((rows) => rows[0]);
      if (activeRevision == null) throw new ConflictError("Active revision is not completed");

      const revision = await createCompletedRevision(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId: input.sourceDocumentId,
        submittedText: activeRevision.submittedText,
      });
      await copyRevisionFiles(tx, {
        ledgerId: input.ledgerId,
        fromRevisionId: document.activeRevisionId,
        toRevisionId: revision.id,
      });
      await replaceManualProjection(tx, {
        ...input,
        previousRevisionId: document.activeRevisionId,
        revisionId: revision.id,
      });
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: revision.id,
          pendingRevisionId: null,
          updatedAt: new Date(),
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return revision.id;
    });
  },

  async recalculate(input) {
    if (input.updates.length === 0) return 0;
    return db.transaction(async (tx) => {
      const uniqueIds = new Set(input.updates.map((update) => update.ledgerEntryId));
      if (uniqueIds.size !== input.updates.length) {
        throw new ValidationError("A ledger entry may only be recalculated once per transaction");
      }
      const changes = JSON.stringify(
        input.updates.map((update) => ({
          id: update.ledgerEntryId,
          converted_amount: update.convertedAmount,
          exchange_rate: update.exchangeRate,
        }))
      );
      const updated = await tx.execute(sql`
        WITH changes AS (
          SELECT * FROM jsonb_to_recordset(${changes}::jsonb) AS value(
            id uuid,
            converted_amount numeric,
            exchange_rate numeric
          )
        )
        UPDATE ledger_entries AS entry
        SET converted_amount = changes.converted_amount,
            exchange_rate = changes.exchange_rate,
            updated_at = ${new Date()}
        FROM changes, source_documents AS document
        WHERE entry.id = changes.id
          AND entry.ledger_id = ${input.ledgerId}
          AND entry.deleted_at IS NULL
          AND document.id = entry.source_document_id
          AND document.ledger_id = entry.ledger_id
          AND document.active_revision_id = entry.source_document_revision_id
          AND document.deleted_at IS NULL
        RETURNING entry.id
      `);
      if (updated.rows.length !== input.updates.length) {
        throw new NotFoundError("Active ledger entry projection");
      }
      return input.updates.length;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction((tx) =>
      softDeleteSourceDocumentInTransaction(tx, ledgerId, sourceDocumentId)
    );
  },
};
