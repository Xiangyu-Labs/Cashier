import { eq, and, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  acceptCandidateRevision,
  abandonCandidateRevision,
  postgresLedgerProjectionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  storeCandidateRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import {
  getTargetSourceDocument,
  getSourceDocumentCandidateReview,
  listTargetSourceDocuments,
} from "@/application/adapters/postgres/source-document-reads";
import { ledgerEntries, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";

const activeEntry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

const candidateEntry = {
  categoryId: null,
  amount: "25.00",
  currency: "CNY",
  itemName: "Dinner",
  description: null,
  convertedAmount: "25.00",
  exchangeRate: "1.000000",
} as const;

/**
 * Set up a document with an active revision and a completed candidate revision.
 */
async function setupDocumentWithCandidate(db: ReturnType<typeof getTestDb>, ledgerId: string) {
  // Step 1: Create a document with an active revision and entries
  const created = await postgresLedgerProjectionAdapter.createManual({
    expectedMainCurrency: "CNY",
    ledgerId,
    title: "Original",
    entryDate: "2026-07-15",
    submittedText: "Original text",
    entries: [activeEntry],
  });
  const originalActiveRevisionId = created.revisionId;

  // Step 2: Create a pending revision (processing)
  const pending = await db.transaction(async (tx) => {
    return createPendingRevisionInTransaction(tx, {
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      submittedText: "Updated text",
    });
  });

  // Step 3: Mark as processing and store as candidate (simulating successful reparse)
  await db
    .update(sourceDocumentRevisions)
    .set({ outcome: "processing" })
    .where(eq(sourceDocumentRevisions.id, pending.revision.id));

  const stored = await storeCandidateRevision(
    ledgerId,
    created.sourceDocumentId,
    pending.revision.id,
    "Updated Title",
    [candidateEntry]
  );
  expect(stored).toBe(true);

  return {
    sourceDocumentId: created.sourceDocumentId,
    originalActiveRevisionId,
    candidateRevisionId: pending.revision.id,
  };
}

describe("source document candidates", () => {
  it("returns complete active and candidate projections for review", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-review");
    const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
      await setupDocumentWithCandidate(db, ledgerId);

    const review = await getSourceDocumentCandidateReview(ledgerId, sourceDocumentId);

    expect(review.active).toMatchObject({
      revisionId: originalActiveRevisionId,
      entryCount: 1,
      total: "12.5",
    });
    expect(review.active.entries[0]).toMatchObject({
      itemName: "Lunch",
      amount: "12.500",
      convertedAmount: "12.500",
    });
    expect(review.candidate).toMatchObject({
      revisionId: candidateRevisionId,
      entryCount: 1,
      total: "25",
    });
    expect(review.candidate.entries[0]).toMatchObject({
      itemName: "Dinner",
      amount: "25.000",
      convertedAmount: "25.000",
    });
  });

  it("abandons an existing candidate before creating a replacement retry", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-retry-replacement");
    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );
    const scheduleProcessing = vi.fn();

    await retrySourceDocument(
      { ledgerId, sourceDocumentId },
      { submissions: postgresSourceDocumentSubmissionAdapter, scheduleProcessing }
    );

    const [oldCandidate, document] = await Promise.all([
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, candidateRevisionId),
      }),
      db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, sourceDocumentId) }),
    ]);
    expect(oldCandidate?.outcome).toBe("abandoned");
    expect(document?.pendingRevisionId).not.toBe(candidateRevisionId);
    const replacement = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, document?.pendingRevisionId ?? ""),
    });
    expect(replacement?.outcome).toBe("processing");
    expect(scheduleProcessing).toHaveBeenCalledTimes(1);
  });

  it("first parse activates directly; reparse creates a candidate", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-first-parse");

    // First parse: should activate directly (no active revision yet)
    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );

    // Verify: candidate revision is completed
    const candidateRevision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, candidateRevisionId),
    });
    expect(candidateRevision?.outcome).toBe("completed");
    expect(candidateRevision?.finalizedAt).not.toBeNull();

    // Verify: pendingRevisionId is still set (candidate)
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.pendingRevisionId).toBe(candidateRevisionId);
    expect(document?.activeRevisionId).not.toBeNull();

    // Verify: candidate entries exist in ledger_entries
    const candidateLedgerEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, candidateRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(candidateLedgerEntries).toHaveLength(1);
    expect(candidateLedgerEntries[0]?.itemName).toBe("Dinner");
  });

  it("accepts a candidate, replacing the active projection atomically", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-accept");

    const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
      await setupDocumentWithCandidate(db, ledgerId);

    const pendingDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    const candidateRevision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, candidateRevisionId),
    });
    expect(pendingDocument?.title).toBe("Original");
    expect(candidateRevision?.title).toBe("Updated Title");

    // Accept the candidate
    const accepted = await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);
    expect(accepted).toBe("completed");

    // Verify: document pointers updated
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(candidateRevisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.title).toBe("Updated Title");

    // Verify: old active entries are soft-deleted
    const oldEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(oldEntries).toHaveLength(0);

    // Verify: candidate entries are now active (not deleted)
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, candidateRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0]?.itemName).toBe("Dinner");
  });

  it("accept candidate is idempotent when already accepted", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-accept-idempotent");

    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );

    // Accept once
    await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);

    // Accept again should be idempotent
    const accepted = await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);
    expect(accepted).toBe("completed");
  });

  it("abandons a candidate, preserving the original active projection", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-abandon");

    const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
      await setupDocumentWithCandidate(db, ledgerId);

    await db
      .update(sourceDocuments)
      .set({ title: "User edited while reviewing" })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    // Abandon the candidate
    const abandoned = await abandonCandidateRevision(
      ledgerId,
      sourceDocumentId,
      candidateRevisionId
    );
    expect(abandoned).toBe(true);

    // Verify: document pointers updated
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(originalActiveRevisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.title).toBe("User edited while reviewing");

    // Verify: candidate revision is marked as abandoned
    const candidateRevision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, candidateRevisionId),
    });
    expect(candidateRevision?.outcome).toBe("abandoned");

    // Verify: original active entries are still intact
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0]?.itemName).toBe("Lunch");
  });

  it("preserves the current title when accepting a candidate with an empty title", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-empty-title");
    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );
    await db
      .update(sourceDocumentRevisions)
      .set({ title: null })
      .where(eq(sourceDocumentRevisions.id, candidateRevisionId));
    await db
      .update(sourceDocuments)
      .set({ title: "Current title" })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.title).toBe("Current title");
  });

  it("abandon candidate is idempotent when already abandoned", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-abandon-idempotent");

    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );

    // Abandon once
    await abandonCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);

    // Abandon again should be idempotent
    const abandoned = await abandonCandidateRevision(
      ledgerId,
      sourceDocumentId,
      candidateRevisionId
    );
    expect(abandoned).toBe(true);
  });

  it("throws ConflictError on accept with stale candidate revision ID", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-stale-accept");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Try to accept with a wrong revision ID — now throws ConflictError under the lock.
    await expect(
      acceptCandidateRevision(ledgerId, sourceDocumentId, crypto.randomUUID())
    ).rejects.toThrow("Cannot accept candidate");
  });

  it("throws ConflictError on abandon with stale candidate revision ID", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-stale-abandon");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Try to abandon with a wrong revision ID — now throws ConflictError under the lock.
    await expect(
      abandonCandidateRevision(ledgerId, sourceDocumentId, crypto.randomUUID())
    ).rejects.toThrow("Cannot abandon candidate");
  });

  it("read model derives candidate_pending status", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-read-model");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Check via getTargetSourceDocument (detail read model)
    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail).not.toBeNull();
    expect(detail?.status).toBe("candidate_pending");
    expect(detail?.supportedActions).toContain("accept_candidate");
    expect(detail?.supportedActions).toContain("abandon_candidate");

    // Check via listTargetSourceDocuments (list read model)
    const listed = await listTargetSourceDocuments({
      ledgerId,
      limit: 10,
    });
    const found = listed.items.find((item) => item.id === sourceDocumentId);
    expect(found).not.toBeUndefined();
    expect(found?.status).toBe("candidate_pending");
    expect(found?.supportedActions).toContain("accept_candidate");
  });

  it("accept then abandon throws ConflictError (candidate already resolved)", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-accept-then-abandon");

    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );

    // Accept first
    await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);

    // Try to abandon after accept — throws ConflictError because pendingRevisionId is already cleared.
    await expect(
      abandonCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId)
    ).rejects.toThrow("Cannot abandon candidate");
  });

  it("soft-delete removes document and all candidate entries", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-soft-delete");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Soft-delete the document
    const deleted = await postgresLedgerProjectionAdapter.softDelete(ledgerId, sourceDocumentId);
    expect(deleted).toBe(true);

    // Verify: document is soft-deleted
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.deletedAt).not.toBeNull();

    // Verify: all entries are soft-deleted
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(activeEntries).toHaveLength(0);
  });
});
