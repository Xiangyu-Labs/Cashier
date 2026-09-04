import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  abandonCandidateRevision,
  acceptCandidateRevision,
  activateDuplicatePendingRevision,
  cancelPendingRevision,
  discardDuplicatePendingRevision,
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
  storeCandidateRevision,
  storeDuplicatePendingRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { listDuplicateDetectionCandidates } from "@/application/adapters/postgres/duplicate-candidates";
import { getSourceDocumentDuplicateReview } from "@/application/adapters/postgres/source-document-reads";
import { duplicateReviews, ledgers, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

async function currentVersion(
  db: ReturnType<typeof getTestDb>,
  sourceDocumentId: string
): Promise<number> {
  const row = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, sourceDocumentId),
    columns: { stateVersion: true },
  });
  if (row == null) throw new Error("Source document not found");
  return row.stateVersion;
}

const entry = {
  categoryId: null,
  amount: "38.00",
  currency: "CNY",
  itemName: "Latte",
  description: null,
  convertedAmount: "38.00",
  exchangeRate: "1.000000",
} as const;

function reviewSnapshot(
  matched: { sourceDocumentId: string; revisionId: string },
  overrides: Partial<{
    matchedTitle: string | null;
    matchedEntryDate: string | null;
    matchedCreatedAt: string;
    reason: string | null;
    confidence: number | null;
  }> = {}
) {
  return {
    matchedSourceDocumentId: matched.sourceDocumentId,
    matchedRevisionId: matched.revisionId,
    matchedTitle: "Coffee Shop",
    matchedEntryDate: "2026-08-05",
    matchedCreatedAt: "2026-08-05T08:00:00.000Z",
    reason: null,
    confidence: 0.9,
    ...overrides,
  };
}

async function createCompletedAiDocument(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  title = "Coffee Shop",
  entryDate = "2026-08-05"
) {
  const manual = await postgresLedgerProjectionAdapter.createManual({
    expectedMainCurrency: "CNY",
    ledgerId,
    title,
    entryDate,
    submittedText: null,
    entries: [entry],
  });
  await db
    .update(sourceDocuments)
    .set({ type: "ai_parsed" })
    .where(eq(sourceDocuments.id, manual.sourceDocumentId));
  return { sourceDocumentId: manual.sourceDocumentId, revisionId: manual.revisionId };
}

async function createDocument(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  entryDate = "2026-08-05"
) {
  const pending = await db.transaction(async (tx) =>
    createPendingRevisionInTransaction(tx, {
      ledgerId,
      entryDate,
      submittedText: null,
    })
  );
  await db
    .update(sourceDocumentRevisions)
    .set({ outcome: "processing" })
    .where(eq(sourceDocumentRevisions.id, pending.revision.id));
  return {
    sourceDocumentId: pending.document.id,
    revisionId: pending.revision.id,
  };
}

async function storeDuplicate(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  document: { sourceDocumentId: string; revisionId: string },
  matched: { sourceDocumentId: string; revisionId: string },
  title: string,
  snapshot: ReturnType<typeof reviewSnapshot>
) {
  const stored = await storeDuplicatePendingRevision(
    ledgerId,
    document.sourceDocumentId,
    document.revisionId,
    title,
    [entry],
    snapshot
  );
  expect(stored).toBe(true);
}

async function createRetry(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  sourceDocumentId: string
) {
  const pending = await db.transaction(async (tx) =>
    createPendingRevisionInTransaction(tx, {
      ledgerId,
      sourceDocumentId,
      submittedText: null,
    })
  );
  await db
    .update(sourceDocumentRevisions)
    .set({ outcome: "processing" })
    .where(eq(sourceDocumentRevisions.id, pending.revision.id));
  return { sourceDocumentId, revisionId: pending.revision.id };
}

async function findDocument(db: ReturnType<typeof getTestDb>, sourceDocumentId: string) {
  return db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, sourceDocumentId),
  });
}

async function findReview(
  db: ReturnType<typeof getTestDb>,
  sourceDocumentId: string,
  revisionId: string
) {
  return db.query.duplicateReviews.findFirst({
    where: and(
      eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
      eq(duplicateReviews.revisionId, revisionId)
    ),
  });
}

describe("duplicate review edge cases", () => {
  it("keeps B duplicate_pending with a readable snapshot after A is deleted", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-delete-matched");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    const b2 = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.92 })
    );
    await storeDuplicate(
      db,
      ledgerId,
      b2,
      a,
      "Duplicate B2",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );

    await postgresRevisionAdapter.softDelete(ledgerId, a.sourceDocumentId);

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.currentStatus).toBe("duplicate_pending");

    const payload = await getSourceDocumentDuplicateReview(ledgerId, b.sourceDocumentId);
    expect(payload.matchedState).toBe("deleted");
    expect(payload.matched?.id).toBe(a.sourceDocumentId);
    expect(payload.matched?.entries[0]?.itemName).toBe("Latte");
    expect(payload.review.reason).toBe("Same bill");
    expect(payload.review.confidence).toBe(0.92);

    // Keep and discard both remain executable against the stable snapshot.
    await expect(
      activateDuplicatePendingRevision(
        ledgerId,
        b.sourceDocumentId,
        await currentVersion(db, b.sourceDocumentId)
      )
    ).resolves.toMatchObject({ status: "completed" });
    await expect(
      discardDuplicatePendingRevision(
        ledgerId,
        b2.sourceDocumentId,
        await currentVersion(db, b2.sourceDocumentId)
      )
    ).resolves.toMatchObject({ status: "deleted" });
  });

  it("shows the detection-time revision after A is modified by a retry", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-modify-matched");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );

    // Modify A via an accepted retry: the old active revision is replaced.
    const aRetry = await createRetry(db, ledgerId, a.sourceDocumentId);
    await storeCandidateRevision(ledgerId, a.sourceDocumentId, aRetry.revisionId, "Updated A", [
      entry,
    ]);
    const aVersion = await currentVersion(db, a.sourceDocumentId);
    expect(await acceptCandidateRevision(ledgerId, a.sourceDocumentId, aVersion)).toMatchObject({
      status: "completed",
    });

    const aDocument = await findDocument(db, a.sourceDocumentId);
    expect(aDocument?.activeRevisionId).toBe(aRetry.revisionId);

    const payload = await getSourceDocumentDuplicateReview(ledgerId, b.sourceDocumentId);
    expect(payload.matchedState).toBe("modified");
    expect(payload.review.matchedSourceDocumentId).toBe(a.sourceDocumentId);
    expect(payload.matched?.entries[0]?.itemName).toBe("Latte");
    expect(payload.review.reason).toBe("Same bill");
    expect(payload.review.confidence).toBe(0.9);
  });

  it("never offers a pending duplicate as a candidate, preventing C->B chains", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-no-chain");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );
    const c = await createDocument(db, ledgerId);

    const candidates = await listDuplicateDetectionCandidates(
      ledgerId,
      "2026-08-05",
      c.sourceDocumentId
    );
    expect(candidates.map((candidate) => candidate.sourceDocumentId)).toEqual([a.sourceDocumentId]);
    expect(candidates[0]?.matchedRevisionId).toBe(a.revisionId);
  });

  it("allows B, C and D to each match the same confirmed A and keeps snapshots after A is deleted", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-many-to-one");
    const a = await createCompletedAiDocument(db, ledgerId);
    const documents = [];
    for (const name of ["B", "C", "D"]) {
      const document = await createDocument(db, ledgerId);
      await storeDuplicate(
        db,
        ledgerId,
        document,
        a,
        `Duplicate ${name}`,
        reviewSnapshot(a, { reason: `Same bill ${name}`, confidence: 0.9 })
      );
      documents.push(document);
    }

    const pending = await db
      .select()
      .from(duplicateReviews)
      .where(and(eq(duplicateReviews.ledgerId, ledgerId), eq(duplicateReviews.status, "pending")));
    expect(pending).toHaveLength(3);

    await postgresRevisionAdapter.softDelete(ledgerId, a.sourceDocumentId);
    for (const document of documents) {
      const payload = await getSourceDocumentDuplicateReview(ledgerId, document.sourceDocumentId);
      expect(payload.matchedState).toBe("deleted");
      expect(payload.matched?.id).toBe(a.sourceDocumentId);
      expect(payload.matched?.entries).toHaveLength(1);
    }
  });

  it("restores the original duplicate review after rejecting a detected retry", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-reject-retry");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Original verdict", confidence: 0.95 })
    );

    // Retry parses as a duplicate again: revision stays a candidate with a
    // staged review and the document stays candidate_pending.
    const retry = await createRetry(db, ledgerId, b.sourceDocumentId);
    await storeCandidateRevision(
      ledgerId,
      b.sourceDocumentId,
      retry.revisionId,
      "Retry title",
      [entry],
      undefined,
      reviewSnapshot(a, { reason: "Retry verdict", confidence: 0.9 })
    );

    let document = await findDocument(db, b.sourceDocumentId);
    expect(document?.currentStatus).toBe("candidate_pending");
    expect((await findReview(db, b.sourceDocumentId, retry.revisionId))?.status).toBe("staged");
    expect((await findReview(db, b.sourceDocumentId, b.revisionId))?.status).toBe("pending");

    await abandonCandidateRevision(
      ledgerId,
      b.sourceDocumentId,
      await currentVersion(db, b.sourceDocumentId)
    );

    document = await findDocument(db, b.sourceDocumentId);
    expect(document?.currentStatus).toBe("duplicate_pending");
    expect(document?.activeRevisionId).toBe(b.revisionId);
    expect(document?.pendingRevisionId).toBeNull();
    const staged = await findReview(db, b.sourceDocumentId, retry.revisionId);
    expect(staged?.status).toBe("discarded");
    expect(staged?.decision).toBe("superseded");
    const original = await findReview(db, b.sourceDocumentId, b.revisionId);
    expect(original?.status).toBe("pending");
    expect(original?.reason).toBe("Original verdict");
  });

  it("accepts a non-duplicate retry as completed and supersedes the original review", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-accept-plain-retry");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );

    const retry = await createRetry(db, ledgerId, b.sourceDocumentId);
    await storeCandidateRevision(ledgerId, b.sourceDocumentId, retry.revisionId, "Fixed parse", [
      entry,
    ]);
    expect(
      await acceptCandidateRevision(
        ledgerId,
        b.sourceDocumentId,
        await currentVersion(db, b.sourceDocumentId)
      )
    ).toMatchObject({ status: "completed" });

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.activeRevisionId).toBe(retry.revisionId);
    expect(document?.currentStatus).toBe("completed");
    const original = await findReview(db, b.sourceDocumentId, b.revisionId);
    expect(original?.status).toBe("discarded");
    expect(original?.decision).toBe("superseded");
    await expect(getSourceDocumentDuplicateReview(ledgerId, b.sourceDocumentId)).rejects.toThrow();
  });

  it("promotes the staged review when the accepted retry is a duplicate", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-accept-duplicate-retry");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Original verdict", confidence: 0.95 })
    );

    const retry = await createRetry(db, ledgerId, b.sourceDocumentId);
    await storeCandidateRevision(
      ledgerId,
      b.sourceDocumentId,
      retry.revisionId,
      "Retry title",
      [entry],
      undefined,
      reviewSnapshot(a, { reason: "Retry verdict", confidence: 0.9 })
    );
    expect(
      await acceptCandidateRevision(
        ledgerId,
        b.sourceDocumentId,
        await currentVersion(db, b.sourceDocumentId)
      )
    ).toMatchObject({ status: "duplicate_pending" });

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.activeRevisionId).toBe(retry.revisionId);
    expect(document?.currentStatus).toBe("duplicate_pending");
    const original = await findReview(db, b.sourceDocumentId, b.revisionId);
    expect(original?.status).toBe("discarded");
    const promoted = await findReview(db, b.sourceDocumentId, retry.revisionId);
    expect(promoted?.status).toBe("pending");
    expect(promoted?.decision).toBeNull();

    const payload = await getSourceDocumentDuplicateReview(ledgerId, b.sourceDocumentId);
    expect(payload.review.sourceDocumentId).toBe(b.sourceDocumentId);
    expect(payload.review.matchedSourceDocumentId).toBe(a.sourceDocumentId);
    expect(payload.review.reason).toBe("Retry verdict");
    expect(payload.matchedState).toBe("unchanged");
  });

  it("restores the original review and projection when a retry is cancelled or fails", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-cancel-retry");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );

    await createRetry(db, ledgerId, b.sourceDocumentId);
    // The pending revision being cancelled is itself "cancelled", but the
    // document's own status restores to the still-pending duplicate review.
    const cancelled = await cancelPendingRevision(
      ledgerId,
      b.sourceDocumentId,
      await currentVersion(db, b.sourceDocumentId)
    );
    expect(cancelled.status).toBe("duplicate_pending");

    let document = await findDocument(db, b.sourceDocumentId);
    expect(document?.activeRevisionId).toBe(b.revisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.currentStatus).toBe("duplicate_pending");
    expect((await findReview(db, b.sourceDocumentId, b.revisionId))?.status).toBe("pending");

    // A failed retry keeps the original review pending until the user
    // abandons the candidate, then the document returns to duplicate_pending.
    const b2 = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b2,
      a,
      "Duplicate B2",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );
    const failedRetry = await createRetry(db, ledgerId, b2.sourceDocumentId);
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: b2.sourceDocumentId,
      revisionId: failedRetry.revisionId,
      outcome: "failed",
      failureCode: "PROCESSING_UNAVAILABLE",
    });
    document = await findDocument(db, b2.sourceDocumentId);
    expect(document?.currentStatus).toBe("failed");
    expect((await findReview(db, b2.sourceDocumentId, b2.revisionId))?.status).toBe("pending");

    await abandonCandidateRevision(
      ledgerId,
      b2.sourceDocumentId,
      await currentVersion(db, b2.sourceDocumentId)
    );
    document = await findDocument(db, b2.sourceDocumentId);
    expect(document?.currentStatus).toBe("duplicate_pending");
    expect(document?.activeRevisionId).toBe(b2.revisionId);
    expect((await findReview(db, b2.sourceDocumentId, b2.revisionId))?.status).toBe("pending");
  });

  it("serialises concurrent accept/abandon of the same staged retry", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-concurrent-retry");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );
    const retry = await createRetry(db, ledgerId, b.sourceDocumentId);
    await storeCandidateRevision(
      ledgerId,
      b.sourceDocumentId,
      retry.revisionId,
      "Retry title",
      [entry],
      undefined,
      reviewSnapshot(a, { reason: "Retry verdict", confidence: 0.9 })
    );

    const raceVersion = await currentVersion(db, b.sourceDocumentId);
    const results = await Promise.allSettled([
      acceptCandidateRevision(ledgerId, b.sourceDocumentId, raceVersion),
      abandonCandidateRevision(ledgerId, b.sourceDocumentId, raceVersion),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.currentStatus).toBe("duplicate_pending");
    const pending = await db
      .select()
      .from(duplicateReviews)
      .where(
        and(
          eq(duplicateReviews.sourceDocumentId, b.sourceDocumentId),
          eq(duplicateReviews.status, "pending")
        )
      );
    expect(pending).toHaveLength(1);
    if (document?.activeRevisionId === retry.revisionId) {
      expect(pending[0]?.revisionId).toBe(retry.revisionId);
    } else {
      expect(document?.activeRevisionId).toBe(b.revisionId);
      expect(pending[0]?.revisionId).toBe(b.revisionId);
    }
  });

  it("supersedes the original review when a retry is accepted with detection disabled", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-detection-off");
    const a = await createCompletedAiDocument(db, ledgerId);
    const b = await createDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Same bill", confidence: 0.9 })
    );
    await db
      .update(ledgers)
      .set({ duplicateDetectionEnabled: false })
      .where(eq(ledgers.id, ledgerId));

    // No staged review is created because duplicate detection is disabled.
    const retry = await createRetry(db, ledgerId, b.sourceDocumentId);
    await storeCandidateRevision(ledgerId, b.sourceDocumentId, retry.revisionId, "Retry title", [
      entry,
    ]);
    expect(
      await acceptCandidateRevision(
        ledgerId,
        b.sourceDocumentId,
        await currentVersion(db, b.sourceDocumentId)
      )
    ).toMatchObject({ status: "completed" });

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.currentStatus).toBe("completed");
    const original = await findReview(db, b.sourceDocumentId, b.revisionId);
    expect(original?.status).toBe("discarded");
    expect(original?.decision).toBe("superseded");
  });

  it("keeps a legacy review readable when the matched bill has no surviving revision", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "edge-null-snapshot");
    // A matched bill that was never projected has no revision pointers at all
    // (legacy rows that pre-date projection backfills).
    const revisionlessMatched = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        title: "Ghost bill",
        type: "ai_parsed",
        currentStatus: "completed",
        entryDate: "2026-08-05",
      })
      .returning({ id: sourceDocuments.id })
      .then((rows) => rows[0]);
    if (revisionlessMatched == null) throw new Error("Expected matched fixture");

    const b = await createDocument(db, ledgerId);
    const a = await createCompletedAiDocument(db, ledgerId);
    await storeDuplicate(
      db,
      ledgerId,
      b,
      a,
      "Duplicate B",
      reviewSnapshot(a, { reason: "Legacy verdict", confidence: 0.9 })
    );
    // Simulate a legacy row whose snapshot was never backfillable: re-point
    // the review at a matched bill with no revision and clear the snapshot.
    await db
      .update(duplicateReviews)
      .set({
        matchedSourceDocumentId: revisionlessMatched.id,
        matchedRevisionId: null,
        matchedTitle: null,
        matchedEntryDate: null,
        matchedCreatedAt: null,
      })
      .where(
        and(
          eq(duplicateReviews.sourceDocumentId, b.sourceDocumentId),
          eq(duplicateReviews.revisionId, b.revisionId)
        )
      );

    const document = await findDocument(db, b.sourceDocumentId);
    expect(document?.currentStatus).toBe("duplicate_pending");
    const payload = await getSourceDocumentDuplicateReview(ledgerId, b.sourceDocumentId);
    expect(payload.matched).toBeNull();
    expect(payload.matchedState).toBe("deleted");
    expect(payload.review.matchedSourceDocumentId).toBe(revisionlessMatched.id);
    expect(payload.review.reason).toBe("Legacy verdict");
    expect(payload.duplicate.entries[0]?.itemName).toBe("Latte");

    // Keep/discard remain executable without a snapshot.
    await expect(
      activateDuplicatePendingRevision(ledgerId, b.sourceDocumentId, document!.stateVersion)
    ).resolves.toMatchObject({ status: "completed" });
  });
});
