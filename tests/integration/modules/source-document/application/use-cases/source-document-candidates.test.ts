import { asc, eq, and, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  acceptCandidateRevision,
  abandonCandidateRevision,
  postgresLedgerProjectionAdapter,
  storeCandidateRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import {
  getTargetSourceDocument,
  listTargetSourceDocuments,
} from "@/application/adapters/postgres/read-models";
import {
  ledgerEntries,
  revisionEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

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

  // Step 2: Create a pending revision (queued)
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
  it("first parse activates directly; reparse creates a candidate", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-first-parse");

    // First parse: should activate directly (no active revision yet)
    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(db, ledgerId);

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

    // Accept the candidate
    const accepted = await acceptCandidateRevision(
      ledgerId,
      sourceDocumentId,
      candidateRevisionId
    );
    expect(accepted).toBe(true);

    // Verify: document pointers updated
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(candidateRevisionId);
    expect(document?.pendingRevisionId).toBeNull();

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
    const accepted = await acceptCandidateRevision(
      ledgerId,
      sourceDocumentId,
      candidateRevisionId
    );
    expect(accepted).toBe(true);
  });

  it("abandons a candidate, preserving the original active projection", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-abandon");

    const { sourceDocumentId, originalActiveRevisionId, candidateRevisionId } =
      await setupDocumentWithCandidate(db, ledgerId);

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

  it("rejects accept with stale candidate revision ID", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-stale-accept");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Try to accept with a wrong revision ID
    const accepted = await acceptCandidateRevision(
      ledgerId,
      sourceDocumentId,
      crypto.randomUUID()
    );
    expect(accepted).toBe(false);
  });

  it("rejects abandon with stale candidate revision ID", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-stale-abandon");

    const { sourceDocumentId } = await setupDocumentWithCandidate(db, ledgerId);

    // Try to abandon with a wrong revision ID
    const abandoned = await abandonCandidateRevision(
      ledgerId,
      sourceDocumentId,
      crypto.randomUUID()
    );
    expect(abandoned).toBe(false);
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

  it("accept then abandon is rejected (candidate already resolved)", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "candidate-accept-then-abandon");

    const { sourceDocumentId, candidateRevisionId } = await setupDocumentWithCandidate(
      db,
      ledgerId
    );

    // Accept first
    await acceptCandidateRevision(ledgerId, sourceDocumentId, candidateRevisionId);

    // Try to abandon after accept should fail (pendingRevisionId already cleared)
    const abandoned = await abandonCandidateRevision(
      ledgerId,
      sourceDocumentId,
      candidateRevisionId
    );
    expect(abandoned).toBe(false);
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
