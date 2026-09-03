import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { getTargetSourceDocument } from "@/application/adapters/postgres/source-document-reads";
import { sourceDocumentRevisions, sourceDocuments } from "@/persistence";
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
    expectedMainCurrency: "CNY",
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

describe("retry active result summary", () => {
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

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    if (detail != null) {
      expect(detail.activeResultSummary).toBeUndefined();
    }
  });

  it("first-parse failure (no active revision) does NOT include activeResultSummary", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-first-failed");

    const { sourceDocumentId } = await setupDocumentWithFirstParseFailure(db, ledgerId, "failed");

    const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
    expect(detail?.status).toBe("failed");
    expect(detail?.activeResultSummary).toBeUndefined();
  });

  it("activeResultSummary reflects accurate count and total with multiple entries", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "retry-multi-entry");

    // Create a manual document with multiple entries
    const created = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
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

    const detail = await getTargetSourceDocument(ledgerId, created.sourceDocumentId);
    expect(detail?.status).toBe("failed");
    expect(detail?.activeResultSummary).toBeDefined();
    expect(detail?.activeResultSummary?.entryCount).toBe(3);
    // Total: 10.00 + 20.00 + 30.00 = 60.00
    expect(detail?.activeResultSummary?.total).toBe("60.00");
  });
});
