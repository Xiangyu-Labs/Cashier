import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import {
  ledgers,
  ledgerEntries,
  entryCategories,
  sourceDocumentRevisions,
  users,
} from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { and, eq, isNull } from "drizzle-orm";

const { getRatesMock } = vi.hoisted(() => ({
  getRatesMock: vi.fn(async () => ({
    base: "USD",
    date: "2026-01-01",
    rates: { CNY: 1 },
  })),
}));

vi.mock("@/application/adapters/postgres/exchange-rate", () => {
  const rateBook = {
    getRates: getRatesMock,
    convertBatch: vi.fn(),
  };
  return { ExchangeRateService: rateBook, postgresFxRateBook: rateBook, fetchWithRetry: vi.fn() };
});
import {
  createLedgerEntryAction,
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
  batchUpdateLedgerEntriesAction,
  batchDeleteLedgerEntriesAction,
  getLedgerEntriesAction,
} from "@/modules/ledger/actions";
import { UNCATEGORIZED_SENTINEL } from "@/modules/ledger/application/queries/list-ledger-entries";
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

async function getTargetLedgerEntriesAction(
  ledgerId: string,
  input: Parameters<typeof getLedgerEntriesAction>[1]
) {
  const db = getTestDb();
  const documents = await db.query.sourceDocuments.findMany({
    where: (documents, { eq }) => eq(documents.ledgerId, ledgerId),
    columns: { id: true },
  });
  for (const document of documents) {
    await activateTestSourceDocumentProjection(db, document.id);
  }
  return getLedgerEntriesAction(ledgerId, input);
}

describe("createLedgerEntryAction", () => {
  let ledgerId: string;
  let docId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,

      mainCurrency: "CNY",
    });
    const doc = await seedDoc(db, ledgerId);
    docId = doc.id;
  });

  it("creates entry with same currency as main currency (no conversion)", async () => {
    const result = await createLedgerEntryAction(
      ledgerId,
      {
        amount: "50",
        currency: "CNY",
        itemName: "午餐",
        sourceDocumentId: docId,
      },
      crypto.randomUUID()
    );

    expect(result.itemName).toBe("午餐");
    expect(result.amount).toBe("50.000");
    expect(result.convertedAmount).toBe("50.000");
    expect(result.exchangeRate).toBe("1");
    expect(getRatesMock).not.toHaveBeenCalled();
  });

  it("creates entry with foreign currency and triggers conversion", async () => {
    getRatesMock.mockResolvedValue({ base: "USD", date: "2026-01-01", rates: { CNY: 7.2 } });

    const result = await createLedgerEntryAction(
      ledgerId,
      {
        amount: "100",
        currency: "USD",
        itemName: "Coffee",
        sourceDocumentId: docId,
      },
      crypto.randomUUID()
    );

    expect(result.currency).toBe("USD");
    expect(result.convertedAmount).toBe("720.000");
    expect(getRatesMock).toHaveBeenCalledWith(undefined);
  });

  it.each([
    { currency: "JPY", amount: "12.6", expected: "13.000" },
    { currency: "KWD", amount: "12.3456", expected: "12.346" },
  ])("rounds $currency entries to their minor unit", async ({ currency, amount, expected }) => {
    await getTestDb()
      .update(ledgers)
      .set({ mainCurrency: currency })
      .where(eq(ledgers.id, ledgerId));

    const result = await createLedgerEntryAction(
      ledgerId,
      { amount, currency, itemName: `${currency} entry`, sourceDocumentId: docId },
      crypto.randomUUID()
    );

    expect(result.amount).toBe(expected);
    expect(result.convertedAmount).toBe(expected);
    expect(result.exchangeRate).toBe("1");
  });

  it("replays a completed create with the same operation ID", async () => {
    const operationId = crypto.randomUUID();
    const input = {
      amount: "12.34",
      currency: "CNY",
      itemName: "Idempotent entry",
      sourceDocumentId: docId,
    };

    const first = await createLedgerEntryAction(ledgerId, input, operationId);
    const replay = await createLedgerEntryAction(ledgerId, input, operationId);

    expect(replay).toEqual(first);
    const activeEntries = await getTestDb().query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });
    expect(activeEntries).toHaveLength(1);
  });

  it("rejects reuse of an operation ID with different content", async () => {
    const operationId = crypto.randomUUID();
    await createLedgerEntryAction(
      ledgerId,
      {
        amount: "10",
        currency: "CNY",
        itemName: "First content",
        sourceDocumentId: docId,
      },
      operationId
    );

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "11",
          currency: "CNY",
          itemName: "Different content",
          sourceDocumentId: docId,
        },
        operationId
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
  });

  it("coalesces concurrent creates with the same operation ID", async () => {
    const operationId = crypto.randomUUID();
    const input = {
      amount: "25",
      currency: "CNY",
      itemName: "Concurrent entry",
      sourceDocumentId: docId,
    };

    const [first, replay] = await Promise.all([
      createLedgerEntryAction(ledgerId, input, operationId),
      createLedgerEntryAction(ledgerId, input, operationId),
    ]);

    expect(replay).toEqual(first);
    const activeEntries = await getTestDb().query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });
    expect(activeEntries).toHaveLength(1);
  });

  it("rejects a source document that belongs to a different ledger", async () => {
    const db = getTestDb();
    const otherLedgerId = uuidv4();
    await db.insert(users).values({
      id: "11111111-1111-1111-1111-111111111111",
      email: "other@example.com",
      name: "Other User",
      emailVerified: new Date(),
    });
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: "11111111-1111-1111-1111-111111111111",
      mainCurrency: "CNY",
    });
    const otherDoc = await seedDoc(db, otherLedgerId);

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "12",
          currency: "CNY",
          itemName: "Cross-ledger doc",
          sourceDocumentId: otherDoc.id,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Source document");
  });

  it("rejects a deleted source document", async () => {
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, docId));

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "12",
          currency: "CNY",
          itemName: "Deleted doc",
          sourceDocumentId: docId,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Source document");
  });

  it("throws 'Ledger not found' for wrong ledger", async () => {
    await expect(
      createLedgerEntryAction(
        uuidv4(),
        {
          amount: "50",
          currency: "CNY",
          itemName: "Test",
          sourceDocumentId: docId,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Ledger not found");
  });
});

describe("updateLedgerEntryAction", () => {
  let ledgerId: string;
  let entryId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,

      mainCurrency: "CNY",
    });

    const doc = await seedDoc(db, ledgerId);
    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "午餐",
        amount: "50.00",
        currency: "CNY",
        convertedAmount: "50.00",
      })
      .returning();
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }
    entryId = entry.id;
    await activateTestSourceDocumentProjection(db, doc.id);
  });

  it("updates itemName without recalculating convertedAmount", async () => {
    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        itemName: "晚餐",
      },
      crypto.randomUUID()
    );
    expect(result.itemName).toBe("晚餐");
    expect(getRatesMock).not.toHaveBeenCalled();
  });

  it("recalculates convertedAmount when amount changes", async () => {
    getRatesMock.mockResolvedValue({ base: "USD", date: "2026-01-01", rates: { CNY: 2 } });

    const db = getTestDb();
    // Change currency to USD first
    await db.update(ledgerEntries).set({ currency: "USD" }).where(eq(ledgerEntries.id, entryId));

    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        amount: "100",
      },
      crypto.randomUUID()
    );

    expect(getRatesMock).toHaveBeenCalled();
    expect(result.convertedAmount).toBe("200.000");
  });

  it("updates categoryId without conversion", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        categoryId: catId,
      },
      crypto.randomUUID()
    );
    expect(result.categoryId).toBe(catId);
    expect(getRatesMock).not.toHaveBeenCalled();
  });
});

describe("deleteLedgerEntryAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
    });
  });

  it("soft-deletes an entry", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Test",
        amount: "10.00",
        currency: "CNY",
      })
      .returning();
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }
    await activateTestSourceDocumentProjection(db, doc.id);

    await deleteLedgerEntryAction(ledgerId, entry.id, crypto.randomUUID());

    const updated = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, entry.id),
    });
    expect(updated?.deletedAt).not.toBeNull();
  });
});

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

    await batchUpdateLedgerEntriesAction(ledgerId, ids, { categoryId: catId });

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
});

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
      entries.slice(0, 2).map((entry) => entry.id)
    );

    expect(result.succeededIds).toEqual(entries.slice(0, 2).map((entry) => entry.id));
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
      entries.map((entry) => entry.id)
    );

    // The legacy document has no canonical active projection, so the entries
    // cannot be deleted. The per-entry delete path reports this as a failure
    // (the projection resolution throws) instead of a silent skip.
    expect(result.succeededIds).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed.map((failure) => failure.id).sort()).toEqual(
      entries.map((entry) => entry.id).sort()
    );
    expect(result.failed[0]?.reason).toContain("canonical active revision");
  });
});

describe("getLedgerEntriesAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
    });
  });

  it("returns paginated entries", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);

    for (let i = 0; i < 5; i++) {
      await db.insert(ledgerEntries).values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: `Item ${i}`,
        amount: "10.00",
        currency: "CNY",
      });
    }

    const result = await getTargetLedgerEntriesAction(ledgerId, { limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeDefined();
  });

  it("paginates same-day same-timestamp documents without duplicates or gaps", async () => {
    const db = getTestDb();
    const createdAt = new Date("2026-05-15T08:00:00.000Z");
    const entriesByDoc: Array<{ a: string; b: string }> = [];

    for (let i = 0; i < 3; i++) {
      const doc = await seedDoc(db, ledgerId, "2026-05-15");
      await db.update(sourceDocuments).set({ createdAt }).where(eq(sourceDocuments.id, doc.id));
      const [a, b] = await db
        .insert(ledgerEntries)
        .values([
          {
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: `A-${i}`,
            amount: "10.00",
            currency: "CNY",
          },
          {
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: `B-${i}`,
            amount: "20.00",
            currency: "CNY",
          },
        ])
        .returning();
      if (a == null || b == null) {
        throw new Error("Expected two ledger entries per document");
      }
      entriesByDoc.push({ a: a.id, b: b.id });
    }

    const collected: string[] = [];
    let cursor: string | null | undefined;
    for (let pageNum = 0; pageNum < 10; pageNum++) {
      const result = await getTargetLedgerEntriesAction(ledgerId, {
        cursor: cursor ?? undefined,
        limit: 2,
      });
      collected.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (cursor == null) break;
    }

    expect(collected).toHaveLength(6);
    expect(new Set(collected).size).toBe(6);
    // Within each document, position 0 must sort before position 1.
    for (const { a, b } of entriesByDoc) {
      const aIndex = collected.indexOf(a);
      const bIndex = collected.indexOf(b);
      expect(aIndex).toBeGreaterThanOrEqual(0);
      expect(bIndex).toBeGreaterThan(aIndex);
    }
  });

  it("rejects a cursor whose fingerprint does not match the query", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "First",
        amount: "10.00",
        currency: "CNY",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Second",
        amount: "20.00",
        currency: "CNY",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Third",
        amount: "30.00",
        currency: "CNY",
      },
    ]);

    const firstPage = await getTargetLedgerEntriesAction(ledgerId, { limit: 2 });
    expect(firstPage.nextCursor).toBeDefined();
    if (firstPage.nextCursor == null) {
      throw new Error("Expected a next cursor on the first page");
    }

    await expect(
      getTargetLedgerEntriesAction(ledgerId, {
        cursor: firstPage.nextCursor,
        categoryId: uuidv4(),
      })
    ).rejects.toThrow("Ledger entry cursor does not match the query");
  });

  it("includes undated documents on their effective (UTC creation) date", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    await db
      .update(sourceDocuments)
      .set({ createdAt: new Date("2026-06-12T18:00:00.000Z") })
      .where(eq(sourceDocuments.id, doc.id));
    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "Undated",
      amount: "10.00",
      currency: "CNY",
    });

    const inRange = await getTargetLedgerEntriesAction(ledgerId, {
      startDate: "2026-06-12",
      endDate: "2026-06-12",
    });
    expect(inRange.items.map((item) => item.itemName)).toEqual(["Undated"]);

    const outside = await getTargetLedgerEntriesAction(ledgerId, {
      startDate: "2026-06-13",
    });
    expect(outside.items).toHaveLength(0);
  });

  it("filters by categoryId", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const doc = await seedDoc(db, ledgerId);
    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Categorized",
        amount: "10.00",
        currency: "CNY",
        categoryId: catId,
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Uncategorized",
        amount: "20.00",
        currency: "CNY",
      },
    ]);

    const result = await getTargetLedgerEntriesAction(ledgerId, { categoryId: catId });
    expect(result.items).toHaveLength(1);
    const categorizedEntry = result.items[0];
    expect(categorizedEntry).toBeDefined();
    expect(categorizedEntry?.itemName).toBe("Categorized");
  });

  it("filters uncategorized entries when using the __uncategorized__ sentinel", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const doc = await seedDoc(db, ledgerId);

    const [categorizedEntry] = await db
      .insert(ledgerEntries)
      .values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Categorized",
        amount: "10.00",
        currency: "CNY",
        categoryId: catId,
      })
      .returning();
    expect(categorizedEntry).toBeDefined();
    if (categorizedEntry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }

    const [uncategorizedEntry] = await db
      .insert(ledgerEntries)
      .values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Uncategorized",
        amount: "20.00",
        currency: "CNY",
      })
      .returning();
    expect(uncategorizedEntry).toBeDefined();
    if (uncategorizedEntry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }

    const result = await getTargetLedgerEntriesAction(ledgerId, {
      categoryId: UNCATEGORIZED_SENTINEL,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(uncategorizedEntry.id);
  });

  it("filters by currency", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "CNY item",
        amount: "10.00",
        currency: "CNY",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "USD item",
        amount: "20.00",
        currency: "USD",
      },
    ]);

    const result = await getTargetLedgerEntriesAction(ledgerId, { currency: "USD" });
    expect(result.items).toHaveLength(1);
    const usdEntry = result.items[0];
    expect(usdEntry).toBeDefined();
    expect(usdEntry?.itemName).toBe("USD item");
  });

  it("filters by date range via sourceDocument.entryDate", async () => {
    const db = getTestDb();
    const doc1 = await seedDoc(db, ledgerId, "2024-01-01");
    const doc2 = await seedDoc(db, ledgerId, "2024-06-01");
    const doc3 = await seedDoc(db, ledgerId, "2024-12-01");

    for (const [doc, name] of [
      [doc1, "Jan"],
      [doc2, "Jun"],
      [doc3, "Dec"],
    ] as const) {
      await db.insert(ledgerEntries).values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: name,
        amount: "10.00",
        currency: "CNY",
      });
    }

    const result = await getTargetLedgerEntriesAction(ledgerId, {
      startDate: "2024-02-01",
      endDate: "2024-11-01",
    });
    expect(result.items).toHaveLength(1);
    const juneEntry = result.items[0];
    expect(juneEntry).toBeDefined();
    expect(juneEntry?.itemName).toBe("Jun");
  });

  it("filters by entryDate not createdAt", async () => {
    const db = getTestDb();

    // Create doc with entryDate in Jan but created in March
    const [docA] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        currentStatus: "completed",
        type: "ai_parsed",
        entryDate: "2024-01-15",
        createdAt: new Date("2024-03-01"),
      })
      .returning();
    expect(docA).toBeDefined();
    if (docA === undefined) {
      throw new Error("Expected source document insert to return a row");
    }

    // Create doc with entryDate in March but created in January
    const [docB] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        currentStatus: "completed",
        type: "ai_parsed",
        entryDate: "2024-03-15",
        createdAt: new Date("2024-01-01"),
      })
      .returning();
    expect(docB).toBeDefined();
    if (docB === undefined) {
      throw new Error("Expected source document insert to return a row");
    }

    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: docA.id,
      itemName: "Jan Item",
      amount: "10.00",
      currency: "CNY",
    });

    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: docB.id,
      itemName: "Mar Item",
      amount: "10.00",
      currency: "CNY",
    });

    // Filter for January 2024
    const result = await getTargetLedgerEntriesAction(ledgerId, {
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    // Should only return entry from docA (entryDate in January)
    expect(result.items).toHaveLength(1);
    const januaryEntry = result.items[0];
    expect(januaryEntry).toBeDefined();
    expect(januaryEntry?.itemName).toBe("Jan Item");
  });

  it("filters by minAmount and maxAmount", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Cheap",
        amount: "10.00",
        currency: "CNY",
        convertedAmount: "10.00",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Mid",
        amount: "50.00",
        currency: "CNY",
        convertedAmount: "50.00",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "Expensive",
        amount: "200.00",
        currency: "CNY",
        convertedAmount: "200.00",
      },
    ]);

    const result = await getTargetLedgerEntriesAction(ledgerId, {
      minAmount: "20",
      maxAmount: "100",
    });
    expect(result.items).toHaveLength(1);
    const midEntry = result.items[0];
    expect(midEntry).toBeDefined();
    expect(midEntry?.itemName).toBe("Mid");
  });

  it("excludes soft-deleted entries", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "Deleted",
      amount: "10.00",
      currency: "CNY",
      deletedAt: new Date(),
    });

    const result = await getTargetLedgerEntriesAction(ledgerId, {});
    expect(result.items).toHaveLength(0);
  });
});
