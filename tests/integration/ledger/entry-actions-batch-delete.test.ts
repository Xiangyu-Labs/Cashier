import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, sourceDocumentRevisions } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { and, eq } from "drizzle-orm";

const { getRatesMock, convertBatchMock } = vi.hoisted(() => ({
  getRatesMock: vi.fn(async () => ({
    base: "USD",
    date: "2026-01-01",
    rates: { CNY: 1 } as Record<string, number>,
  })),
  convertBatchMock: vi.fn(),
}));

vi.mock("@/application/adapters/postgres/exchange-rate", () => {
  const rateBook = {
    getRates: getRatesMock,
    convertBatch: convertBatchMock,
  };
  return { ExchangeRateService: rateBook, postgresFxRateBook: rateBook, fetchWithRetry: vi.fn() };
});
import { batchDeleteLedgerEntriesAction } from "@/modules/ledger/actions";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

async function seedDoc(db: ReturnType<typeof getTestDb>, ledgerId: string, entryDate?: string) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      id: uuidv4(),
      ledgerId,
      currentStatus: "completed",
      type: "ai_parsed",
      entryDate: entryDate ?? null,
    })
    .returning();
  expect(doc).toBeDefined();
  if (doc === undefined) {
    throw new Error("Expected source document insert to return a row");
  }
  await activateTestSourceDocumentProjection(db, doc.id);
  return doc;
}

describe("batchDeleteLedgerEntriesAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      mainCurrency: "CNY",
    });
  });

  it("creates one replacement revision when deleting multiple entries from one document", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    const entries = await db
      .insert(ledgerEntries)
      .values(
        [10, 20, 30].map((amount, index) => ({
          id: uuidv4(),
          ledgerId,
          sourceDocumentId: doc.id,
          itemName: `Item ${index}`,
          amount: String(amount),
          currency: "CNY",
          convertedAmount: String(amount),
        }))
      )
      .returning();
    await activateTestSourceDocumentProjection(db, doc.id);

    const beforeRevisionCount = await db
      .select({ id: sourceDocumentRevisions.id })
      .from(sourceDocumentRevisions)
      .where(eq(sourceDocumentRevisions.sourceDocumentId, doc.id));
    const result = await batchDeleteLedgerEntriesAction(
      ledgerId,
      [{ sourceDocumentId: doc.id, expectedVersion: 1 }],
      entries.slice(0, 2).map((entry) => entry.id)
    );

    expect(result.succeeded.map((item) => item.id).sort()).toEqual(
      entries
        .slice(0, 2)
        .map((entry) => entry.id)
        .sort()
    );
    expect(result.failed).toHaveLength(0);
    const afterRevisionCount = await db
      .select({ id: sourceDocumentRevisions.id })
      .from(sourceDocumentRevisions)
      .where(eq(sourceDocumentRevisions.sourceDocumentId, doc.id));
    expect(afterRevisionCount).toHaveLength(beforeRevisionCount.length + 1);

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, doc.id),
        eq(ledgerEntries.sourceDocumentRevisionId, document!.activeRevisionId!)
      ),
    });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0]?.itemName).toBe("Item 2");
  });

  it("resolves legacy projections before deletion instead of skipping their entries", async () => {
    const db = getTestDb();
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        currentStatus: "completed",
        type: "ai_parsed",
        entryDate: null,
      })
      .returning();
    expect(doc).toBeDefined();
    const entries = await db
      .insert(ledgerEntries)
      .values(
        [10, 20].map((amount, index) => ({
          id: uuidv4(),
          ledgerId,
          sourceDocumentId: doc!.id,
          itemName: `Legacy ${index}`,
          amount: String(amount),
          currency: "CNY",
          convertedAmount: String(amount),
        }))
      )
      .returning();

    const result = await batchDeleteLedgerEntriesAction(
      ledgerId,
      [{ sourceDocumentId: doc!.id, expectedVersion: 1 }],
      entries.map((entry) => entry.id)
    );

    // The legacy document has no canonical active projection, so the entries
    // cannot be deleted. The per-entry delete path reports this as a failure
    // (the projection resolution throws) instead of a silent skip.
    expect(result.succeeded).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.failed.map((failure) => failure.id).sort()).toEqual(
      entries.map((entry) => entry.id).sort()
    );
    expect(result.failed[0]?.code).toBe("NOT_FOUND");
  });
});
