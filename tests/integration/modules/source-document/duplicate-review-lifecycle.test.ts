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
import {
  calculateCompletedSourceDocumentTotal,
  getSourceDocumentDuplicateReview,
  getTargetSourceDocument,
  listTargetSourceDocuments,
} from "@/application/adapters/postgres/source-document-reads";
import { calculateLedgerEntryStats } from "@/application/adapters/postgres/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryPage } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-page";
import { postgresRevisionAdapter } from "@/application/adapters/postgres/revisions";
import { duplicateReviews, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";
import { StaleSourceDocumentVersionError } from "@/lib/errors";

async function currentVersion(sourceDocumentId: string): Promise<number> {
  const db = getTestDb();
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
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Coffee Shop",
      [entry],
      reviewSnapshot(matched, {
        reason: "Same merchant and total",
        confidence: 0.93,
      })
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
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Original",
      [entry],
      reviewSnapshot(matched, { confidence: 0.8 })
    );

    const staleVersion = await currentVersion(sourceDocumentId);
    const kept = await activateDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion);
    expect(kept).toMatchObject({ status: "completed", version: staleVersion + 1 });

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

    // Replaying at the now-current (post-keep) version is a no-op success:
    // the review is already "kept" for this same active revision, so the
    // version does not advance further.
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion + 1)
    ).resolves.toMatchObject({ status: "completed", version: staleVersion + 1 });

    // A stale replay at the pre-keep version is rejected, with zero writes.
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion)
    ).rejects.toThrow(StaleSourceDocumentVersionError);

    // The document is now a normal completed bill (review no longer attached).
    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail?.duplicateReview).toBeUndefined();
  });

  it("migrates legacy pending duplicate projections into the active model", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-migration");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      matchedRevisionId: matched.revisionId,
      matchedTitle: "Original",
      matchedEntryDate: "2026-08-05",
      matchedCreatedAt: new Date("2026-08-05T08:00:00.000Z"),
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
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Original",
      [entry],
      reviewSnapshot(matched, {
        reason: "Same bill",
        confidence: 0.99,
      })
    );

    const staleVersion = await currentVersion(sourceDocumentId);
    const discarded = await discardDuplicatePendingRevision(
      ledgerId,
      sourceDocumentId,
      staleVersion
    );
    expect(discarded).toMatchObject({ status: "deleted", version: staleVersion + 1 });

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(document?.deletedAt).not.toBeNull();

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review?.status).toBe("discarded");
    expect(review?.decision).toBe("discard_duplicate");

    // The active projection is excluded by the document tombstone, so the
    // surviving matched bill remains the only accounting projection.
    await expect(calculateCompletedSourceDocumentTotal({ ledgerId })).resolves.toEqual({
      total: "38",
      unconvertedCount: 0,
    });
    await expect(calculateLedgerEntryStats({ ledgerId, filters: {} })).resolves.toMatchObject({
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

    // Replaying discard at the now-current (post-discard) version is a no-op
    // success: the document is already tombstoned by this same decision.
    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion + 1)
    ).resolves.toMatchObject({ status: "deleted", version: staleVersion + 1 });

    // A stale replay at the pre-discard version is rejected.
    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion)
    ).rejects.toThrow(StaleSourceDocumentVersionError);

    // Activating (keeping) after discard finds no non-deleted document to act on.
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion + 1)
    ).resolves.toBeNull();
  });

  it("blocks active projection replacement while a duplicate review is pending", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-edit-conflict");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Original",
      [entry],
      reviewSnapshot(matched, { reason: "Same bill" })
    );
    const staleVersion = await currentVersion(sourceDocumentId);

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
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, staleVersion)
    ).resolves.toMatchObject({ status: "completed", version: staleVersion + 1 });
  });

  it("retires a pending duplicate review when the document is deleted", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-delete");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Original",
      [entry],
      reviewSnapshot(matched, { reason: "Same bill" })
    );

    await expect(postgresRevisionAdapter.softDelete(ledgerId, sourceDocumentId)).resolves.toBe(
      true
    );

    const review = await db.query.duplicateReviews.findFirst({
      where: eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
    });
    expect(review).toMatchObject({
      status: "discarded",
      decision: "superseded",
    });
    await expect(getSourceDocumentDuplicateReview(ledgerId, sourceDocumentId)).rejects.toThrow();
    const versionAfterDelete = await currentVersion(sourceDocumentId);
    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, versionAfterDelete)
    ).resolves.toBeNull();
    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, versionAfterDelete)
    ).resolves.toBeNull();
  });

  it("returns null for a missing duplicate document", async () => {
    const { ledgerId } = await createTestUserWithLedger(getTestDb(), "duplicate-missing");
    const sourceDocumentId = crypto.randomUUID();

    await expect(
      activateDuplicatePendingRevision(ledgerId, sourceDocumentId, 1)
    ).resolves.toBeNull();
    await expect(
      discardDuplicatePendingRevision(ledgerId, sourceDocumentId, 1)
    ).resolves.toBeNull();
  });
});
