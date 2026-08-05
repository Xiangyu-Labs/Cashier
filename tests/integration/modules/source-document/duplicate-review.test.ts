import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
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
import { calculateLedgerEntryStats } from "@/application/adapters/postgres/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryPage } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-page";
import { postgresRevisionAdapter } from "@/application/adapters/postgres/revisions";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
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
  it("stores a first-parse duplicate as an active revision with a pending review", async () => {
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
    expect(document?.activeRevisionId).toBe(revisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.title).toBe("Coffee Shop");

    // The revision title remains the compatibility fallback for historical
    // rows that have no document-level title.
    await db
      .update(sourceDocuments)
      .set({ title: null })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("pending");
    expect(review?.reason).toBe("Same merchant and total");
    expect(review?.confidence).toBe("0.930");

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail?.status).toBe("duplicate_pending");
    expect(detail?.title).toBe("Coffee Shop");
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

  it("migrates legacy pending duplicate projections into the active model", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-migration");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Original",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const { sourceDocumentId, revisionId } = await createDuplicatePendingDocument(db, ledgerId);

    await db
      .update(sourceDocumentRevisions)
      .set({ title: "Recovered title", outcome: "completed", finalizedAt: new Date() })
      .where(eq(sourceDocumentRevisions.id, revisionId));
    await db.insert(duplicateReviews).values({
      ledgerId,
      sourceDocumentId,
      revisionId,
      matchedSourceDocumentId: matched.sourceDocumentId,
      status: "pending",
      reason: "Legacy review",
      confidence: "0.900",
    });
    await db
      .update(sourceDocuments)
      .set({
        activeRevisionId: null,
        pendingRevisionId: revisionId,
        title: null,
        currentStatus: "duplicate_pending",
      })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    const migration = readFileSync(
      path.resolve("src/persistence/postgres-migrations/0020_duplicate_detection_enabled.sql"),
      "utf8"
    );
    for (const statement of migration
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter((part) => part !== "")) {
      await db.execute(sql.raw(statement));
    }

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(revisionId);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.currentStatus).toBe("duplicate_pending");
    expect(document?.title).toBe("Recovered title");
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

    // The active projection is excluded by the document tombstone, so all
    // accounting reads immediately fall back to the original bill.
    await expect(calculateCompletedSourceDocumentTotal({ ledgerId })).resolves.toEqual({
      total: "38",
    });
    await expect(
      calculateLedgerEntryStats({ ledgerId, filters: {}, mainCurrency: "CNY" })
    ).resolves.toMatchObject({
      convertedTotal: { total: "38", currency: "CNY" },
    });
    await expect(listLedgerEntryPage({ ledgerId, limit: 20, filters: {} })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          sourceDocument: expect.objectContaining({
            id: matched.sourceDocumentId,
            status: "completed",
          }),
        }),
      ],
    });

    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(true);

    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(false);
  });

  it("blocks active projection replacement while a duplicate review is pending", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-edit-conflict");
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
        confidence: 0.9,
      }
    );

    await expect(
      postgresLedgerProjectionAdapter.replaceActive({
        ledgerId,
        sourceDocumentId,
        expectedActiveRevisionId: revisionId,
        entries: [entry],
      })
    ).rejects.toThrow("Source document has a pending duplicate review");

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.activeRevisionId).toBe(revisionId);
    expect(document?.currentStatus).toBe("duplicate_pending");
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, revisionId)
    ).resolves.toBe(true);
  });

  it("retires a pending duplicate review when the document is deleted", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-delete");
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
        confidence: 0.9,
      }
    );

    await expect(
      deleteSourceDocument({ ledgerId, sourceDocumentId }, postgresRevisionAdapter)
    ).resolves.toEqual({ sourceDocumentId, deleted: true });

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review).toMatchObject({
      status: "discarded",
      decision: "superseded",
    });
    await expect(getSourceDocumentDuplicateReview(ledgerId, sourceDocumentId)).rejects.toThrow();
  });

  it("counts duplicate pending amounts immediately and keeps them in attention", async () => {
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
    // The active duplicate projection is already part of the accounting total.
    expect(totals[0].total).toBe("76");
    expect(totals[1].total).toBe("76");

    const ledgerPage = await listLedgerEntryPage({ ledgerId, limit: 20, filters: {} });
    expect(
      ledgerPage.items.find((item) => item.sourceDocumentId === sourceDocumentId)?.sourceDocument
        ?.status
    ).toBe("duplicate_pending");

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
