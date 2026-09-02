import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  activateDuplicatePendingRevision,
  discardDuplicatePendingRevision,
  postgresLedgerProjectionAdapter,
  storeDuplicatePendingRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import {
  calculateCompletedSourceDocumentTotal,
  countSourceDocumentsByStatus,
  getTargetSourceDocument,
  listPendingDuplicateReviews,
} from "@/application/adapters/postgres/source-document-reads";
import { listLedgerEntryPage } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-page";
import {
  batchResolveDuplicateReviews,
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
  it("counts duplicate pending amounts immediately and keeps them in attention", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-stats");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      reviewSnapshot(matched)
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

  it("keeps the pending review while a retry is in flight and defers the verdict", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-supersede");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      reviewSnapshot(matched, {
        reason: "Same bill",
        confidence: 0.95,
      })
    );

    // A retry keeps the original pending review: the document is only judged
    // again after the retry is rejected or accepted.
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
    expect(review?.status).toBe("pending");
    expect(review?.revisionId).toBe(revisionId);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.pendingRevisionId).toBe(next.revision.id);
    expect(document?.currentStatus).toBe("processing");

    // Keep/discard must not be acknowledged while the retry is pending: the
    // document is `processing`, not `duplicate_pending`.
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

  it("batch-keeps only pending duplicates within the requested ledger", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-batch");
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      "duplicate-batch-other@example.com",
      undefined,
      randomUUID()
    );
    const original = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
      ledgerId,
      title: "Original",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const otherOriginal = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
      ledgerId: otherLedgerId,
      title: "Other original",
      entryDate: "2026-08-05",
      submittedText: null,
      entries: [entry],
    });
    const first = await createDuplicatePendingDocument(db, ledgerId);
    const other = await createDuplicatePendingDocument(db, otherLedgerId);

    await storeDuplicatePendingRevision(
      ledgerId,
      first.sourceDocumentId,
      first.revisionId,
      "Original",
      [entry],
      reviewSnapshot(original, {
        reason: "Same bill",
        confidence: 0.95,
      })
    );
    await storeDuplicatePendingRevision(
      otherLedgerId,
      other.sourceDocumentId,
      other.revisionId,
      "Other ledger",
      [entry],
      reviewSnapshot(otherOriginal, {
        reason: "Same bill",
        confidence: 0.95,
      })
    );

    const result = await batchResolveDuplicateReviews(
      {
        ledgerId,
        sourceDocumentIds: [
          first.sourceDocumentId,
          original.sourceDocumentId,
          other.sourceDocumentId,
        ],
        decision: "keep",
      },
      {
        reviews: { listPendingDuplicateReviews },
        lifecycle: {
          keepDuplicate: activateDuplicatePendingRevision,
          discardDuplicate: discardDuplicatePendingRevision,
        },
      }
    );

    expect(result).toMatchObject({
      requestedCount: 3,
      succeededIds: [first.sourceDocumentId],
      skipped: expect.arrayContaining([
        { id: original.sourceDocumentId, reason: "not_duplicate_pending" },
        { id: other.sourceDocumentId, reason: "not_duplicate_pending" },
      ]),
    });
    await expect(getTargetSourceDocument(ledgerId, first.sourceDocumentId)).resolves.toMatchObject({
      status: "completed",
    });
    await expect(
      getTargetSourceDocument(otherLedgerId, other.sourceDocumentId)
    ).resolves.toMatchObject({ status: "duplicate_pending" });

    const repeat = await batchResolveDuplicateReviews(
      {
        ledgerId,
        sourceDocumentIds: [first.sourceDocumentId],
        decision: "keep",
      },
      {
        reviews: { listPendingDuplicateReviews },
        lifecycle: {
          keepDuplicate: activateDuplicatePendingRevision,
          discardDuplicate: discardDuplicatePendingRevision,
        },
      }
    );
    expect(repeat.skipped).toEqual([
      { id: first.sourceDocumentId, reason: "not_duplicate_pending" },
    ]);
  });
});
