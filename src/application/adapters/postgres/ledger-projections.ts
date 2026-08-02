import { and, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import type { LedgerProjectionEntryContract, LedgerProjectionPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isValidDecimal } from "@/lib/money/decimal";
import {
  entryCategories,
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import type { PostgresTransaction } from "./transaction-locks";

function activeDocumentWhere(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    eq(sourceDocuments.id, sourceDocumentId),
    isNull(sourceDocuments.deletedAt)
  )!;
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
  for (const [position, entry] of input.entries.entries()) {
    const ledgerEntryId = entry.id ?? crypto.randomUUID();
    await tx.insert(ledgerEntries).values({
      id: ledgerEntryId,
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
    });
  }
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

  for (const [position, entry] of input.entries.entries()) {
    const ledgerEntryId = entry.id ?? crypto.randomUUID();
    await tx.insert(ledgerEntries).values({
      id: ledgerEntryId,
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
    });
  }
}

/**
 * Store a completed but non-activated revision candidate.
 * Inserts ledger entries linked to the candidate revision and marks the revision as completed,
 * but does NOT update activeRevisionId or clear pendingRevisionId on the document.
 */
export async function storeCandidateRevision(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string,
  title: string | null | undefined,
  entries: readonly LedgerProjectionEntryContract[]
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Lock the source document to serialize concurrent operations.
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);

    // Re-verify pointer ownership inside the lock.
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
      .then((rows) => rows[0]);
    if (revision == null || revision.outcome !== "processing") {
      return false;
    }

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
    // The candidate title is committed only if this revision is accepted.
    return true;
  });
}

/**
 * Accept a candidate revision: replace the active projection with the candidate's entries
 * and update document pointers.
 *
 * Acquires a source-document row lock to serialise concurrent operations on the same document.
 * Throws {@link ConflictError} when pointer ownership or CAS checks fail so the entire
 * transaction (including soft-deletes) rolls back.
 */
export async function acceptCandidateRevision(
  ledgerId: string,
  sourceDocumentId: string,
  candidateRevisionId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Lock the source document to serialise concurrent operations.
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);

    // Idempotent: candidate is already active
    if (document.activeRevisionId === candidateRevisionId && document.pendingRevisionId == null) {
      return true;
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
    return true;
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
    // Lock the source document to serialise concurrent operations.
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
  for (const id of requestedIds) {
    if (previousById.has(id)) continue;
    const existing = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.id, id))
      .then((rows) => rows[0]);
    if (existing != null) throw new NotFoundError("Active ledger entry projection");
  }

  const now = new Date();
  const retainedIds = new Set(requestedIds);
  const retainedEntries = previousEntries.filter((previous) => retainedIds.has(previous.id));
  for (const [index, previous] of retainedEntries.entries()) {
    await tx
      .update(ledgerEntries)
      .set({
        sourceDocumentRevisionId: input.revisionId,
        position: input.entries.length + index,
        updatedAt: now,
      })
      .where(and(eq(ledgerEntries.ledgerId, input.ledgerId), eq(ledgerEntries.id, previous.id)));
  }

  for (const previous of retainedEntries) {
    const archivedId = crypto.randomUUID();
    await tx.insert(ledgerEntries).values({
      ...previous,
      id: archivedId,
      deletedAt: now,
      updatedAt: now,
    });
  }

  for (const previous of previousEntries) {
    if (!retainedIds.has(previous.id)) {
      await tx
        .update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(ledgerEntries.ledgerId, input.ledgerId), eq(ledgerEntries.id, previous.id)));
    }
  }

  for (const [position, entry] of input.entries.entries()) {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    const ledgerEntryId = existing?.id ?? entry.id ?? crypto.randomUUID();
    if (existing == null) {
      await tx.insert(ledgerEntries).values({
        id: ledgerEntryId,
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
      });
    } else {
      await tx
        .update(ledgerEntries)
        .set({
          sourceDocumentRevisionId: input.revisionId,
          position,
          categoryId: entry.categoryId,
          amount: entry.amount,
          currency: entry.currency,
          itemName: entry.itemName,
          description: entry.description,
          convertedAmount: entry.convertedAmount,
          exchangeRate: entry.exchangeRate,
          deletedAt: null,
          updatedAt: now,
        })
        .where(
          and(eq(ledgerEntries.ledgerId, input.ledgerId), eq(ledgerEntries.id, ledgerEntryId))
        );
    }
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
  }
) {
  const now = new Date();
  const revisionNumber = await nextRevisionNumber(tx, input.sourceDocumentId);
  const revision = await tx
    .insert(sourceDocumentRevisions)
    .values({
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
  const files = await tx
    .select({ storedFileId: revisionFiles.storedFileId, position: revisionFiles.position })
    .from(revisionFiles)
    .where(
      and(
        eq(revisionFiles.ledgerId, input.ledgerId),
        eq(revisionFiles.revisionId, input.fromRevisionId)
      )
    );
  for (const file of files) {
    await tx.insert(revisionFiles).values({
      ledgerId: input.ledgerId,
      revisionId: input.toRevisionId,
      storedFileId: file.storedFileId,
      position: file.position,
    });
  }
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
        .then((rows) => rows[0]);
      if (revision == null || revision.outcome !== "processing") {
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
      await lockLedgerForUpdate(tx, input.ledgerId);

      const sourceDocumentId = input.sourceDocumentId ?? crypto.randomUUID();
      const existing = await tx
        .select({ id: sourceDocuments.id })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, sourceDocumentId))
        .then((rows) => rows[0]);
      if (existing != null) throw new ConflictError("Source document already exists");
      await tx.insert(sourceDocuments).values({
        id: sourceDocumentId,
        ledgerId: input.ledgerId,
        title: input.title ?? null,
        type: "manual",
        entryDate: input.entryDate ?? null,
      });
      const revision = await createCompletedRevision(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
      });
      await replaceProjection(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        revisionId: revision.id,
        entries: input.entries,
      });
      await tx
        .update(sourceDocuments)
        .set({ activeRevisionId: revision.id, pendingRevisionId: null })
        .where(activeDocumentWhere(input.ledgerId, sourceDocumentId));
      return { sourceDocumentId, revisionId: revision.id };
    });
  },

  async replaceManual(input) {
    return db.transaction(async (tx) => {
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
      for (const update of input.updates) {
        const active = await tx
          .select({ id: ledgerEntries.id })
          .from(ledgerEntries)
          .innerJoin(
            sourceDocuments,
            and(
              eq(sourceDocuments.ledgerId, ledgerEntries.ledgerId),
              eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
              eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId)
            )
          )
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.id, update.ledgerEntryId),
              isNull(ledgerEntries.deletedAt),
              isNull(sourceDocuments.deletedAt)
            )
          )
          .then((rows) => rows[0]);
        if (active == null) throw new NotFoundError("Active ledger entry projection");
        await tx
          .update(ledgerEntries)
          .set({
            convertedAmount: update.convertedAmount,
            exchangeRate: update.exchangeRate,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.id, update.ledgerEntryId)
            )
          );
      }
      return input.updates.length;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction(async (tx) => {
      // Lock the source document to serialise with other concurrent operations.
      // Return false (not throw) when the document does not exist.
      try {
        await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }

      const now = new Date();
      const deleted = await tx
        .update(sourceDocuments)
        .set({ deletedAt: now, updatedAt: now })
        .where(activeDocumentWhere(ledgerId, sourceDocumentId))
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
    });
  },
};
