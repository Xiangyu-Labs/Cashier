import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  postgresLedgerProjectionAdapter,
  storeDuplicatePendingRevision,
} from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { listDuplicateDetectionCandidates } from "@/application/adapters/postgres/duplicate-candidates";
import { getSourceDocumentDuplicateReview } from "@/application/adapters/postgres/source-document-reads";
import { sourceDocumentRevisions, sourceDocuments } from "@/persistence";
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
  it("lists same-day completed AI candidates and excludes manual/different-date docs", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "duplicate-candidates");
    const matched = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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
      expectedMainCurrency: "CNY",
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
      "CNY",
      "Coffee Shop",
      [entry],
      reviewSnapshot(matched, {
        reason: "Same bill",
        confidence: 0.88,
      })
    );

    const payload = await getSourceDocumentDuplicateReview(ledgerId, sourceDocumentId);
    expect(payload.review.matchedSourceDocumentId).toBe(matched.sourceDocumentId);
    expect(payload.review.matchedSourceDocumentId).toBe(matched.sourceDocumentId);
    expect(payload.duplicate.id).toBe(sourceDocumentId);
    expect(payload.duplicate.title).toBe("Coffee Shop");
    expect(payload.duplicate.entries[0]?.itemName).toBe("Latte");
    expect(payload.matched).not.toBeNull();
    expect(payload.matched?.id).toBe(matched.sourceDocumentId);
    expect(payload.matched?.title).toBe("Coffee Shop");
    expect(payload.matched?.entryDate).toBe("2026-08-05");
    expect(payload.matched?.createdAt).toBe("2026-08-05T08:00:00.000Z");
    expect(payload.matchedState).toBe("unchanged");
  });
});
