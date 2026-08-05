import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  activateDuplicatePendingRevision,
  discardDuplicatePendingRevision,
  postgresLedgerProjectionAdapter,
  storeDuplicatePendingRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { listDuplicateDetectionCandidates } from "@/application/adapters/postgres/duplicate-candidates";
import {
  calculateCompletedSourceDocumentTotal,
  countSourceDocumentsByStatus,
  getSourceDocumentDuplicateReview,
  getTargetSourceDocument,
  listTargetSourceDocuments,
} from "@/application/adapters/postgres/read-models";
import {
  keepDuplicateDocument,
  discardDuplicateDocument,
} from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import type { SourceDocumentLifecyclePort } from "@/modules/source-document/application/ports";
import { duplicateReviews, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

const entry = {
  categoryId: null,
  amount: "38.00",
  currency: "CNY",
  itemName: "Latte",
  description: null,
  convertedAmount: "38.00",
  exchangeRate: "1.000000",
} as const;

async function createDuplicatePendingDocument(
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

describe("duplicate review lifecycle", () => {
  it("stores a first-parse duplicate as a pending non-active revision", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-store");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Coffee Shop",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);

    const stored = await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Coffee Shop",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: "Same merchant and total",
        confidence: 0.93,
      }
    );
    expect(stored).toBe(true);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.currentStatus).toBe("duplicate_pending");
    expect(document?.activeRevisionId).toBeNull();
    expect(document?.pendingRevisionId).toBe(revisionId);

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("pending");
    expect(review?.reason).toBe("Same merchant and total");
    expect(review?.confidence).toBe("0.930");

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail?.status).toBe("duplicate_pending");
    expect(detail?.duplicateReview?.matchedSourceDocumentId).toBe(matched.sourceDocumentId);
    expect(detail?.supportedActions).toEqual(
      expect.arrayContaining(["keep_duplicate", "discard_duplicate"])
    );

    const list = await listTargetSourceDocuments({
      ledgerId,
      limit: 20,
    });
    expect(list.items[0]?.duplicateReview?.status).toBe("pending");
  });

  it("keeps the duplicate atomically and idempotently", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-keep");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Original",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);
    await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Original",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: null,
        confidence: 0.8,
      }
    );

    const kept = await activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId);
    expect(kept).toBe(true);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(revisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.currentStatus).toBe("completed");

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("kept");
    expect(review?.decision).toBe("keep_duplicate");

    // Idempotent repeat.
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(true);

    // The document is now a normal completed bill (review no longer attached).
    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail?.duplicateReview).toBeUndefined();
  });

  it("discards the duplicate as a soft delete and keeps the review record", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-discard");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Original",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);
    await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Original",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: "Same bill",
        confidence: 0.99,
      }
    );

    const discarded = await discardDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId);
    expect(discarded).toBe(true);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.deletedAt).not.toBeNull();

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("discarded");
    expect(review?.decision).toBe("discard_duplicate");

    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(true);

    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(false);
  });

  it("keeps duplicates out of stats and attention until resolved", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-stats");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Coffee Shop",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);
    await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Coffee Shop",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: null,
        confidence: 0.9,
      }
    );

    const counts = await countSourceDocumentsByStatus(ledgerId);
    expect(counts.attentionCount).toBe(1);

    const totals = await Promise.all([
      calculateCompletedSourceDocumentTotal({ ledgerId }),
      calculateCompletedSourceDocumentTotal({
        ledgerId,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ]);
    // Only the matched bill counts; the duplicate pending document is excluded.
    expect(totals[0].total).toBe("38");
    expect(totals[1].total).toBe("38");

    await activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId);
    const afterKeep = await calculateCompletedSourceDocumentTotal({ ledgerId });
    expect(afterKeep.total).toBe("76");
  });

  it("retires the pending review when a retry supersedes the revision", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-supersede");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Coffee Shop",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);
    await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Coffee Shop",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: "Same bill",
        confidence: 0.95,
      }
    );

    // Retry supersedes the reviewed revision.
    const next = await db.transaction(async (tx) =>
      createPendingRevisionInTransaction(tx, {
        ledgerId,
        sourceDocumentId,
        submittedText: null,
      })
    );

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("discarded");
    expect(review?.decision).toBe("superseded");

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.pendingRevisionId).toBe(next.revision.id);
    expect(document?.currentStatus).toBe("processing");

    // Keep/discard on the retired review must not be acknowledged.
    const lifecycle = {
      keepDuplicate: activateDuplicatePendingRevision,
      discardDuplicate: discardDuplicatePendingRevision,
    } as unknown as SourceDocumentLifecyclePort;
    await expect(
      keepDuplicateDocument({ ledgerId, sourceDocumentId, revisionId }, lifecycle)
    ).rejects.toThrow();
  });

  it("rejects keep/discard when the lifecycle reports failure", async () => {
    const lifecycle = {
      keepDuplicate: async () => false,
      discardDuplicate: async () => false,
    } as unknown as SourceDocumentLifecyclePort;
    await expect(
      keepDuplicateDocument(
        { ledgerId: "ledger-1", sourceDocumentId: "doc-1", revisionId: "rev-1" },
        lifecycle
      )
    ).rejects.toThrow("Source document");
    await expect(
      discardDuplicateDocument(
        { ledgerId: "ledger-1", sourceDocumentId: "doc-1", revisionId: "rev-1" },
        lifecycle
      )
    ).rejects.toThrow("Source document");
  });

  it("lists same-day completed AI candidates and excludes manual/different-date docs", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-candidates");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "AI Bill",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    await db
      .update(sourceDocuments)
      .set({ type: "ai_parsed" })
      .where(eq(sourceDocuments.id, matched.sourceDocumentId));
    const { sourceDocumentId } = await createDuplicatePendingDocument(db, ledgerId);

    const otherDay = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Other Day",
      entryDate: "2026-08-04",
      submittedText: null,
      entries: [entry],
    });
    await db
      .update(sourceDocuments)
      .set({ type: "ai_parsed" })
      .where(eq(sourceDocuments.id, otherDay.sourceDocumentId));

    const candidates = await listDuplicateDetectionCandidates(
      ledgerId,
      "2026-08-05",
      sourceDocumentId
    );
    expect(candidates.map((candidate) => candidate.sourceDocumentId)).toEqual([
      matched.sourceDocumentId,
    ]);
    expect(candidates[0]?.entries[0]?.itemName).toBe("Latte");
  });

  it("loads the side-by-side review payload for the UI", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-review-payload");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Coffee Shop",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);
    await storeDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      revisionId,
      "Coffee Shop",
      [entry],
      {
        matchedSourceDocumentId: matched.sourceDocumentId,
        reason: "Same bill",
        confidence: 0.88,
      }
    );

    const payload = await getSourceDocumentDuplicateReview(ledgerId, sourceDocumentId);
    expect(payload.review.matchedSourceDocumentId).toBe(matched.sourceDocumentId);
    expect(payload.duplicate.id).toBe(sourceDocumentId);
    expect(payload.duplicate.title).toBe("Coffee Shop");
    expect(payload.duplicate.entries[0]?.itemName).toBe("Latte");
    expect(payload.matched?.id).toBe(matched.sourceDocumentId);
  });
});
