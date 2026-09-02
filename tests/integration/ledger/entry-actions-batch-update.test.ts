import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { and, eq, isNull } from "drizzle-orm";

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
import {
  batchUpdateLedgerEntriesAction,
  batchUpdateLedgerEntryDatesAction,
  previewBatchLedgerEntryDateAction,
} from "@/modules/ledger/actions";
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

describe("batchUpdateLedgerEntriesAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
    });
  });

  it("batch updates categoryId for multiple entries", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const doc = await seedDoc(db, ledgerId);
    const ids: string[] = [];

    for (let i = 0; i < 2; i++) {
      const [e] = await db
        .insert(ledgerEntries)
        .values({
          id: uuidv4(),
          ledgerId,
          sourceDocumentId: doc.id,
          itemName: `Item ${i}`,
          amount: "10.00",
          currency: "CNY",
        })
        .returning();
      expect(e).toBeDefined();
      if (e === undefined) {
        throw new Error("Expected ledger entry insert to return a row");
      }
      ids.push(e.id);
    }
    await activateTestSourceDocumentProjection(db, doc.id);

    const before = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    await batchUpdateLedgerEntriesAction(ledgerId, ids, { categoryId: catId });
    const after = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });

    expect(after?.activeRevisionId).not.toBe(before?.activeRevisionId);
    const archived = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentRevisionId, before!.activeRevisionId!),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(archived).toHaveLength(0);

    for (const id of ids) {
      const entry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, id),
      });
      expect(entry?.categoryId).toBe(catId);
    }
  });

  it("removes categories from entries when given categoryId null", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const doc = await seedDoc(db, ledgerId);
    const ids: string[] = [];

    for (let i = 0; i < 2; i++) {
      const [e] = await db
        .insert(ledgerEntries)
        .values({
          id: uuidv4(),
          ledgerId,
          sourceDocumentId: doc.id,
          itemName: `Item ${i}`,
          amount: "10.00",
          currency: "CNY",
          categoryId: catId,
        })
        .returning();
      expect(e).toBeDefined();
      if (e === undefined) {
        throw new Error("Expected ledger entry insert to return a row");
      }
      ids.push(e.id);
    }
    await activateTestSourceDocumentProjection(db, doc.id);

    await batchUpdateLedgerEntriesAction(ledgerId, ids, { categoryId: null });

    for (const id of ids) {
      const entry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, id),
      });
      expect(entry?.categoryId).toBeNull();
    }
  });

  it("commits the date change and returns the locked impact", async () => {
    const db = getTestDb();
    convertBatchMock.mockResolvedValue([
      { convertedAmount: "10", exchangeRate: "1" },
      { convertedAmount: "20", exchangeRate: "1" },
    ]);
    const doc = await seedDoc(db, ledgerId, "2026-01-01");
    const ids = (
      await db
        .insert(ledgerEntries)
        .values([
          {
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: "First",
            amount: "10",
            currency: "CNY",
          },
          {
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: "Second",
            amount: "20",
            currency: "CNY",
          },
        ])
        .returning({ id: ledgerEntries.id })
    ).map((entry) => entry.id);
    const activeRevisionId = await activateTestSourceDocumentProjection(db, doc.id);
    const preview = await previewBatchLedgerEntryDateAction(ledgerId, [ids[0]!]);

    const committed = await batchUpdateLedgerEntryDatesAction(ledgerId, [ids[0]!], "2026-01-02");

    expect(committed).toEqual(preview);
    expect(committed).toMatchObject({
      selectedEntryCount: 1,
      sourceDocumentCount: 1,
      affectedEntryCount: 2,
      sourceDocumentIds: [doc.id],
    });
    const updatedDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    expect(updatedDocument?.entryDate).toBe("2026-01-02");
    expect(updatedDocument?.activeRevisionId).not.toBe(activeRevisionId);
  });
});
