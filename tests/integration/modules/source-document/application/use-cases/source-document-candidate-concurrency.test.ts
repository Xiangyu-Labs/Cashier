import { eq, and, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  acceptCandidateRevision,
  abandonCandidateRevision,
  postgresLedgerProjectionAdapter,
  storeCandidateRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { ledgerEntries, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
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
