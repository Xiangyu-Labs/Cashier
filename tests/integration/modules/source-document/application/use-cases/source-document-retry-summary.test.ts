import { describe, expect, it } from "vitest";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import {
  createPendingRevisionInTransaction,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres/revisions";
import { getTargetSourceDocument } from "@/application/adapters/postgres/source-document-reads";
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
  outcome: "invalid" | "failed"
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

  // Step 3: Set the pending revision outcome to invalid/failed
  await postgresRevisionAdapter.preserveTerminalOutcome({
    ledgerId,
    sourceDocumentId: created.sourceDocumentId,
    revisionId: pending.revision.id,
    outcome,
    ...(outcome === "invalid" ? { invalidReason: "Validation invalid" } : {}),
  });

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
  outcome: "invalid" | "failed"
) {
  const pending = await db.transaction((tx) =>
    createPendingRevisionInTransaction(tx, { ledgerId })
  );
  await postgresRevisionAdapter.preserveTerminalOutcome({
    ledgerId,
    sourceDocumentId: pending.document.id,
    revisionId: pending.revision.id,
    outcome,
    ...(outcome === "invalid" ? { invalidReason: "First parse invalid" } : {}),
  });
  return { sourceDocumentId: pending.document.id, pendingRevisionId: pending.revision.id };
}

describe("retry active result summary", () => {
  it("includes the active result summary for terminal retries", async () => {
    const db = getTestDb();
    for (const outcome of ["invalid", "failed"] as const) {
      const { ledgerId } = await createTestUserWithLedger(
        db,
        `retry-${outcome}-detail@example.com`,
        undefined,
        crypto.randomUUID()
      );
      const { sourceDocumentId } = await setupDocumentWithFailedRetry(db, ledgerId, outcome);

      const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
      expect(detail).toMatchObject({
        status: outcome,
        activeResultSummary: { entryCount: 1, total: "12.50" },
      });
    }
  });

  it("omits the active result summary when the first parse has no active revision", async () => {
    const db = getTestDb();
    for (const outcome of ["invalid", "failed"] as const) {
      const { ledgerId } = await createTestUserWithLedger(
        db,
        `retry-first-${outcome}@example.com`,
        undefined,
        crypto.randomUUID()
      );
      const { sourceDocumentId } = await setupDocumentWithFirstParseFailure(db, ledgerId, outcome);

      const detail = await getTargetSourceDocument(ledgerId, sourceDocumentId);
      expect(detail).toMatchObject({ status: outcome });
      expect(detail?.activeResultSummary).toBeUndefined();
    }
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
          amount: "9007199254740992.01",
          currency: "CNY",
          itemName: "Item 1",
          description: null,
          convertedAmount: "9007199254740992.01",
          exchangeRate: "1.000000",
        },
        {
          categoryId: null,
          amount: "0.01",
          currency: "CNY",
          itemName: "Item 2",
          description: null,
          convertedAmount: "0.01",
          exchangeRate: "1.000000",
        },
        {
          categoryId: null,
          amount: "0.01",
          currency: "CNY",
          itemName: "Item 3",
          description: null,
          convertedAmount: "0.01",
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
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      revisionId: pending.revision.id,
      outcome: "failed",
    });

    const detail = await getTargetSourceDocument(ledgerId, created.sourceDocumentId);
    expect(detail?.status).toBe("failed");
    expect(detail?.activeResultSummary).toBeDefined();
    expect(detail?.activeResultSummary?.entryCount).toBe(3);
    expect(detail?.activeResultSummary?.total).toBe("9007199254740992.03");
  });
});
