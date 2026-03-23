import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

// Mock currency conversion use-case to avoid external API calls
vi.mock("@/modules/currency/use-cases", () => ({
  convertEntryAmount: vi.fn(
    async (input: { amount: number; fromCurrency: string; toCurrency: string }) => {
      if (input.fromCurrency === input.toCurrency) {
        return {
          convertedAmount: input.amount.toFixed(2),
          exchangeRate: "1",
        };
      }

      return {
        convertedAmount: "100.00",
        exchangeRate: "1.00",
      };
    }
  ),
}));

import { convertEntryAmount } from "@/modules/currency/use-cases";
import {
  createLedgerEntryAction,
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
  getLedgerEntriesAction,
} from "@/modules/ledger/actions";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

async function seedDoc(db: ReturnType<typeof getTestDb>, ledgerId: string, entryDate?: string) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      id: uuidv4(),
      ledgerId,
      text: "test",
      status: "completed",
      type: "ai_parsed",
      imageUrls: [],
      entryDate: entryDate ?? null,
    })
    .returning();
  expect(doc).toBeDefined();
  if (doc === undefined) {
    throw new Error("Expected source document insert to return a row");
  }
  return doc;
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

      metadata: { settings: { mainCurrency: "CNY" } },
    });
    const doc = await seedDoc(db, ledgerId);
    docId = doc.id;
  });

  it("creates entry with same currency as main currency (no conversion)", async () => {
    const result = await createLedgerEntryAction(ledgerId, {
      amount: 50,
      currency: "CNY",
      itemName: "午餐",
      sourceDocumentId: docId,
    });

    expect(result.itemName).toBe("午餐");
    expect(result.amount).toBe("50.00");
    expect(result.convertedAmount).toBe("50.00");
    expect(result.exchangeRate).toBe("1");
    expect(convertEntryAmount).toHaveBeenCalledWith({
      amount: 50,
      fromCurrency: "CNY",
      toCurrency: "CNY",
    });
  });

  it("creates entry with foreign currency and triggers conversion", async () => {
    vi.mocked(convertEntryAmount).mockResolvedValue({
      convertedAmount: "720.00",
      exchangeRate: "7.20",
    });

    const result = await createLedgerEntryAction(ledgerId, {
      amount: 100,
      currency: "USD",
      itemName: "Coffee",
      sourceDocumentId: docId,
    });

    expect(result.currency).toBe("USD");
    expect(result.convertedAmount).toBe("720.00");
    expect(convertEntryAmount).toHaveBeenCalledWith({
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "CNY",
    });
  });

  it("throws 'Ledger not found' for wrong ledger", async () => {
    await expect(
      createLedgerEntryAction(uuidv4(), {
        amount: 50,
        currency: "CNY",
        itemName: "Test",
        sourceDocumentId: docId,
      })
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

      metadata: { settings: { mainCurrency: "CNY" } },
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
  });

  it("updates itemName without recalculating convertedAmount", async () => {
    const result = await updateLedgerEntryAction(ledgerId, entryId, {
      itemName: "晚餐",
    });
    expect(result.itemName).toBe("晚餐");
    expect(convertEntryAmount).not.toHaveBeenCalled();
  });

  it("recalculates convertedAmount when amount changes", async () => {
    vi.mocked(convertEntryAmount).mockResolvedValue({
      convertedAmount: "200.00",
      exchangeRate: "2.00",
    });

    const db = getTestDb();
    // Change currency to USD first
    await db.update(ledgerEntries).set({ currency: "USD" }).where(eq(ledgerEntries.id, entryId));

    const result = await updateLedgerEntryAction(ledgerId, entryId, {
      amount: 100,
    });

    expect(convertEntryAmount).toHaveBeenCalled();
    expect(result.convertedAmount).toBe("200.00");
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

    const result = await updateLedgerEntryAction(ledgerId, entryId, {
      categoryId: catId,
    });
    expect(result.categoryId).toBe(catId);
    expect(convertEntryAmount).not.toHaveBeenCalled();
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

      metadata: {},
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

    await deleteLedgerEntryAction(ledgerId, entry.id);

    const updated = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, entry.id),
    });
    expect(updated?.deletedAt).not.toBeNull();
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

      metadata: {},
    });
  });

  it("soft-deletes multiple entries", async () => {
    const db = getTestDb();
    const doc = await seedDoc(db, ledgerId);
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
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

    await batchDeleteLedgerEntriesAction(ledgerId, ids);

    for (const id of ids) {
      const entry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, id),
      });
      expect(entry?.deletedAt).not.toBeNull();
    }
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

      metadata: {},
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

    await batchUpdateLedgerEntriesAction(ledgerId, ids, { categoryId: catId });

    for (const id of ids) {
      const entry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, id),
      });
      expect(entry?.categoryId).toBe(catId);
    }
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

      metadata: {},
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

    const result = await getLedgerEntriesAction(ledgerId, { limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeDefined();
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

    const result = await getLedgerEntriesAction(ledgerId, { categoryId: catId });
    expect(result.items).toHaveLength(1);
    const categorizedEntry = result.items[0];
    expect(categorizedEntry).toBeDefined();
    expect(categorizedEntry?.itemName).toBe("Categorized");
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

    const result = await getLedgerEntriesAction(ledgerId, { currency: "USD" });
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

    const result = await getLedgerEntriesAction(ledgerId, {
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
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
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
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
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
    const result = await getLedgerEntriesAction(ledgerId, {
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

    const result = await getLedgerEntriesAction(ledgerId, {
      minAmount: 20,
      maxAmount: 100,
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

    const result = await getLedgerEntriesAction(ledgerId, {});
    expect(result.items).toHaveLength(0);
  });
});
