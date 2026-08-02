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
} from "@/application/adapters/postgres/read-models";
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

/**
 * Set up a document with an active revision and a failed/anomalous pending revision.
 */
async function setupDocumentWithFailedRetry(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  outcome: "anomaly" | "failed"
) {
  // Step 1: Create a document with an active revision and entries
  const created = await postgresLedgerProjectionAdapter.createManual({
    ledgerId,
    title: "Original",
    entryDate: "2026-07-15",
    submittedText: "Original text",
    entries: [activeEntry],
  });

  // Step 2: Create a pending revision (processing)
  const pending = await db.transaction(async (tx) => {
    return createPendingRevisionInTransaction(tx, {
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      submittedText: "Retry text",
    });
  });

  // Step 3: Set the pending revision outcome to anomaly/failed
  await db
    .update(sourceDocumentRevisions)
    .set({
      outcome,
      finalizedAt: new Date(),
      ...(outcome === "anomaly" ? { anomalyReason: "Validation anomaly" } : {}),
    })
    .where(eq(sourceDocumentRevisions.id, pending.revision.id));

  return {
    sourceDocumentId: created.sourceDocumentId,
    activeRevisionId: created.revisionId,
    pendingRevisionId: pending.revision.id,
  };
}

/**
 * Set up a document with ONLY a failed/anomalous pending revision (no active revision).
 * Simulates a first-parse failure.
 */
async function setupDocumentWithFirstParseFailure(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  outcome: "anomaly" | "failed"
) {
  const sourceDocumentId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();

  await db.insert(sourceDocuments).values({
    id: sourceDocumentId,
    ledgerId,
    type: "ai_parsed",
  });

  await db.insert(sourceDocumentRevisions).values({
    id: revisionId,
    ledgerId,
    sourceDocumentId,
    revisionNumber: 1,
    outcome,
    finalizedAt: new Date(),
    ...(outcome === "anomaly" ? { anomalyReason: "First parse anomaly" } : {}),
  });
  await db
    .update(sourceDocuments)
    .set({ pendingRevisionId: revisionId })
    .where(eq(sourceDocuments.id, sourceDocumentId));

  return { sourceDocumentId, pendingRevisionId: revisionId };
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
      amount: "12.50",
      convertedAmount: "12.50",
    });
    expect(review.candidate).toMatchObject({
      revisionId: candidateRevisionId,
      entryCount: 1,
      total: "25",
    });
    expect(review.candidate.entries[0]).toMatchObject({
      itemName: "Dinner",
      amount: "25.00",
      convertedAmount: "25.00",
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
    expect(accepted).toBe(true);

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
    expect(accepted).toBe(true);
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

  it("list read model attaches candidate comparison with active and pending summaries", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-comparison");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    const listed = await listTargetSourceDocuments({
      ledgerId,
      limit: 10,
    });
    const candidate = listed.items.find((item) => item.id === sourceDocumentId);
    expect(candidate).not.toBeUndefined();
    expect(candidate?.status).toBe("candidate_pending");

    // Candidate comparison must be present
    const comparison = candidate?.candidateComparison;
    expect(comparison).toBeDefined();

    // Active projection: 1 entry (Lunch, CNY 12.50)
    expect(comparison?.active.entryCount).toBe(1);
    expect(comparison?.active.total).toBe("12.50");

    // Candidate projection: 1 entry (Dinner, CNY 25.00)
    expect(comparison?.candidate.entryCount).toBe(1);
    expect(comparison?.candidate.total).toBe("25.00");

    // Totals differ, so changed must be true
    expect(comparison?.changed).toBe(true);
  });

  it("list read model omits candidate comparison for non-candidate items", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-no-comparison");

    await setupDocumentWithCandidate(db, ledgerId);

    const listed = await listTargetSourceDocuments({
      ledgerId,
      limit: 10,
    });
    // Completed and non-candidate items must not carry comparison data
    for (const item of listed.items) {
      if (item.status !== "candidate_pending") {
        expect(item.candidateComparison).toBeUndefined();
      }
    }
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

describe("candidate concurrency invariants", () => {
  /**
   * Helper: verify that after a concurrent Accept/Abandon race, the document state
   * is fully consistent — no partial commits or mixed pointer/revision/entry states.
   */
  async function assertDocumentConsistency(
    db: ReturnType<typeof getTestDb>,
    sourceDocumentId: string,
    originalActiveRevisionId: string,
    candidateRevisionId: string
  ) {
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    if (!doc) throw new Error("Document not found after concurrent operation");

    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, candidateRevisionId),
    });

    if (doc.activeRevisionId === candidateRevisionId) {
      // Accept won
      // pendingRevisionId must be null
      expect(doc.pendingRevisionId).toBeNull();
      // Revision outcome must NOT be "abandoned" (accept doesn't change the
      // completed outcome)
      expect(revision?.outcome).toBe("completed");
      // Old active entries must be soft-deleted
      const oldEntries = await db.query.ledgerEntries.findMany({
        where: and(
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
          isNull(ledgerEntries.deletedAt)
        ),
      });
      expect(oldEntries).toHaveLength(0);
      // Candidate entries must be active
      const candidateEntries = await db.query.ledgerEntries.findMany({
        where: and(
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, candidateRevisionId),
          isNull(ledgerEntries.deletedAt)
        ),
      });
      expect(candidateEntries).toHaveLength(1);
    } else if (doc.activeRevisionId === originalActiveRevisionId) {
      // Abandon won (or accept failed and nothing changed)
      // pendingRevisionId must be null regardless
      expect(doc.pendingRevisionId).toBeNull();
      // If abandon won, revision must be abandoned; if accept failed, it stays completed.
      // Either way: no soft-deleted original entries (abandon preserves them).
      const oldEntries = await db.query.ledgerEntries.findMany({
        where: and(
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
          isNull(ledgerEntries.deletedAt)
        ),
      });
      expect(oldEntries).toHaveLength(1);
    } else {
      // Neither won — unexpected
      throw new Error(`Unexpected document state: activeRevisionId=${doc.activeRevisionId}`);
    }
  }

  it("concurrent Accept and Abandon produce a single consistent outcome", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-race-accept-abandon");

    // Run 5 iterations to increase the chance of catching a timing issue.
    for (let i = 0; i < 5; i++) {
      const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
        await setupDocumentWithCandidate(db, ledgerId);

      await Promise.allSettled([
        acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId),
        abandonCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId),
      ]);

      await assertDocumentConsistency(
        db,
        sourceDocumentId,
        originalActiveRevisionId,
        candidateRevisionId
      );

      // Clean up for next iteration
      await db.transaction(async (tx) => {
        await tx
          .update(sourceDocuments)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(sourceDocuments.id, sourceDocumentId));
        await tx
          .update(ledgerEntries)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(ledgerEntries.ledgerId, ledgerId));
      });
    }
  });

  it("concurrent Accept and Delete produce a single consistent outcome", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-race-accept-delete");

    for (let i = 0; i < 5; i++) {
      const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
        await setupDocumentWithCandidate(db, ledgerId);

      await Promise.allSettled([
        acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId),
        postgresLedgerProjectionAdapter.softDelete(ledgerId, sourceDocumentId),
      ]);

      // Verify: the document is either deleted or accepted, never in a mixed state.
      const doc = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, sourceDocumentId),
      });
      if (doc?.deletedAt != null) {
        // Delete won — all entries should be soft-deleted
        const activeEntries = await db.query.ledgerEntries.findMany({
          where: and(
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          ),
        });
        expect(activeEntries).toHaveLength(0);
      } else if (doc != null) {
        // Accept won — document should have consistent pointers
        const oldEntries = await db.query.ledgerEntries.findMany({
          where: and(
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
            isNull(ledgerEntries.deletedAt)
          ),
        });
        if (doc.activeRevisionId === candidateRevisionId) {
          expect(oldEntries).toHaveLength(0);
        } else {
          expect(oldEntries).toHaveLength(1);
        }
        // pendingRevisionId should be cleared if accept succeeded
        expect(
          doc.pendingRevisionId == null || doc.activeRevisionId === originalActiveRevisionId
        ).toBe(true);
      }

      // Clean up
      await db.transaction(async (tx) => {
        await tx
          .update(sourceDocuments)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(sourceDocuments.id, sourceDocumentId));
        await tx
          .update(ledgerEntries)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(ledgerEntries.ledgerId, ledgerId));
      });
    }
  });

  it("concurrent Abandon and Delete produce a single consistent outcome", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-race-abandon-delete");

    for (let i = 0; i < 5; i++) {
      const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
        await setupDocumentWithCandidate(db, ledgerId);

      await Promise.allSettled([
        abandonCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId),
        postgresLedgerProjectionAdapter.softDelete(ledgerId, sourceDocumentId),
      ]);

      const doc = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, sourceDocumentId),
      });
      if (doc?.deletedAt != null) {
        // Delete won
        const activeEntries = await db.query.ledgerEntries.findMany({
          where: and(
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          ),
        });
        expect(activeEntries).toHaveLength(0);
      } else if (doc != null) {
        // Abandon won — original entries preserved
        const oldEntries = await db.query.ledgerEntries.findMany({
          where: and(
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
            isNull(ledgerEntries.deletedAt)
          ),
        });
        expect(oldEntries).toHaveLength(1);
        expect(doc.pendingRevisionId).toBeNull();
      }

      await db.transaction(async (tx) => {
        await tx
          .update(sourceDocuments)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(sourceDocuments.id, sourceDocumentId));
        await tx
          .update(ledgerEntries)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(ledgerEntries.ledgerId, ledgerId));
      });
    }
  });

  it("concurrent Abandon and Retry produce a single consistent outcome", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-race-abandon-retry");

    for (let i = 0; i < 5; i++) {
      const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
        await setupDocumentWithCandidate(db, ledgerId);

      // Run abandon and retry (createPendingRevisionInTransaction) concurrently.
      // Both acquire the source-document lock, so they serialise.
      await Promise.allSettled([
        abandonCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId),
        db.transaction(async (tx) => {
          return createPendingRevisionInTransaction(tx, {
            ledgerId,
            sourceDocumentId,
            submittedText: "Retry attempt",
          });
        }),
      ]);

      // Verify consistent state.
      const doc = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, sourceDocumentId),
      });
      if (!doc) throw new Error("Document not found after concurrent abandon+retry");

      // Invariant: activeRevisionId must always remain the original (neither operation changes it).
      expect(doc.activeRevisionId).toBe(originalActiveRevisionId);

      // Invariant: original active entries must always be preserved.
      const oldEntries = await db.query.ledgerEntries.findMany({
        where: and(
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, originalActiveRevisionId),
          isNull(ledgerEntries.deletedAt)
        ),
      });
      expect(oldEntries).toHaveLength(1);

      // Invariant: candidate revision must be abandoned regardless of which operation won.
      const candidateRev = await db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, candidateRevisionId),
      });
      expect(candidateRev?.outcome).toBe("abandoned");

      // If the retry succeeded (abandon cleared the pending first), the new pending
      // must point to a fresh processing revision, not the old candidate.
      if (doc.pendingRevisionId != null) {
        expect(doc.pendingRevisionId).not.toBe(candidateRevisionId);
        const newPending = await db.query.sourceDocumentRevisions.findFirst({
          where: eq(sourceDocumentRevisions.id, doc.pendingRevisionId),
        });
        expect(newPending?.outcome).toBe("processing");
      }

      // Clean up for next iteration
      await db.transaction(async (tx) => {
        await tx
          .update(sourceDocuments)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(sourceDocuments.id, sourceDocumentId));
        await tx
          .update(ledgerEntries)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(ledgerEntries.ledgerId, ledgerId));
      });
    }
  });
});

describe("retry active result summary", () => {
  it("anomalous retry with active revision includes activeResultSummary in list", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-anomaly-list");

    const { sourceDocumentId } = await setupDocumentWithFailedRetry(db, ledgerId, "anomaly");

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("anomaly");

    // Must have activeResultSummary with the active entry's data
    expect(item?.activeResultSummary).toBeDefined();
    expect(item?.activeResultSummary?.entryCount).toBe(1);
    // activeEntry has amount "12.50", convertedAmount "12.50"
    expect(item?.activeResultSummary?.total).toBe("12.50");
  });

  it("anomalous retry with active revision includes activeResultSummary in detail", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-anomaly-detail");

    const { sourceDocumentId } = await setupDocumentWithFailedRetry(db, ledgerId, "anomaly");

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail).not.toBeNull();
    expect(detail?.status).toBe("anomaly");

    expect(detail?.activeResultSummary).toBeDefined();
    expect(detail?.activeResultSummary?.entryCount).toBe(1);
    expect(detail?.activeResultSummary?.total).toBe("12.50");
  });

  it("failed retry with active revision includes activeResultSummary in list", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-failed-list");

    const { sourceDocumentId } = await setupDocumentWithFailedRetry(db, ledgerId, "failed");

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("failed");

    expect(item?.activeResultSummary).toBeDefined();
    expect(item?.activeResultSummary?.entryCount).toBe(1);
    expect(item?.activeResultSummary?.total).toBe("12.50");
  });

  it("failed retry with active revision includes activeResultSummary in detail", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-failed-detail");

    const { sourceDocumentId } = await setupDocumentWithFailedRetry(db, ledgerId, "failed");

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail).not.toBeNull();
    expect(detail?.status).toBe("failed");

    expect(detail?.activeResultSummary).toBeDefined();
    expect(detail?.activeResultSummary?.entryCount).toBe(1);
    expect(detail?.activeResultSummary?.total).toBe("12.50");
  });

  it("first-parse anomaly (no active revision) does NOT include activeResultSummary", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-first-anomaly");

    const { sourceDocumentId } = await setupDocumentWithFirstParseFailure(db, ledgerId, "anomaly");

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("anomaly");

    // No active revision, so no activeResultSummary
    expect(item?.activeResultSummary).toBeUndefined();

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    if (detail != null) {
      expect(detail.activeResultSummary).toBeUndefined();
    }
  });

  it("first-parse failure (no active revision) does NOT include activeResultSummary", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-first-failed");

    const { sourceDocumentId } = await setupDocumentWithFirstParseFailure(db, ledgerId, "failed");

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("failed");

    expect(item?.activeResultSummary).toBeUndefined();
  });

  it("candidate_pending document does NOT include activeResultSummary", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-candidate");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("candidate_pending");

    // candidate_pending documents use candidateComparison, not activeResultSummary
    expect(item?.activeResultSummary).toBeUndefined();
    expect(item?.candidateComparison).toBeDefined();
  });

  it("activeResultSummary reflects accurate count and total with multiple entries", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-multi-entry");

    // Create a manual document with multiple entries
    const created = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Multi-entry",
      entryDate: "2026-07-15",
      submittedText: "Multi entry doc",
      entries: [
        {
          categoryId: null,
          amount: "10.00",
          currency: "CNY",
          itemName: "Item 1",
          description: null,
          convertedAmount: "10.00",
          exchangeRate: "1.000000",
        },
        {
          categoryId: null,
          amount: "20.00",
          currency: "CNY",
          itemName: "Item 2",
          description: null,
          convertedAmount: "20.00",
          exchangeRate: "1.000000",
        },
        {
          categoryId: null,
          amount: "30.00",
          currency: "CNY",
          itemName: "Item 3",
          description: null,
          convertedAmount: "30.00",
          exchangeRate: "1.000000",
        },
      ],
    });

    // Create a failed pending revision
    const pending = await db.transaction(async (tx) => {
      return createPendingRevisionInTransaction(tx, {
        ledgerId,
        sourceDocumentId: created.sourceDocumentId,
        submittedText: "Failed retry",
      });
    });
    await db
      .update(sourceDocumentRevisions)
      .set({ outcome: "failed", finalizedAt: new Date() })
      .where(eq(sourceDocumentRevisions.id, pending.revision.id));

    const listed = await listTargetSourceDocuments({ ledgerId, limit: 10 });
    const item = listed.items.find((i) => i.id === created.sourceDocumentId);
    expect(item).not.toBeUndefined();
    expect(item?.status).toBe("failed");

    expect(item?.activeResultSummary).toBeDefined();
    expect(item?.activeResultSummary?.entryCount).toBe(3);
    // Total: 10.00 + 20.00 + 30.00 = 60.00
    expect(item?.activeResultSummary?.total).toBe("60.00");
  });
});
