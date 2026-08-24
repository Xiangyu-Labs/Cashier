import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateLedgerEntryAction } from "@/modules/ledger/actions";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories, ledgers } from "@/persistence";
import { eq } from "drizzle-orm";
import {
  createTestUserWithLedger,
  createTestSourceDocument,
  activateTestSourceDocumentProjection,
  TEST_USER_ID,
} from "../../helpers/schema-setup";

// Mock the exchange rate service
vi.mock("@/application/adapters/postgres/exchange-rate", () => {
  const rateBook = {
    getRates: vi.fn().mockResolvedValue({
      base: "USD",
      date: "2026-01-01",
      rates: { CNY: 7 },
    }),
    convertBatch: vi.fn(),
  };
  return { ExchangeRateService: rateBook, postgresFxRateBook: rateBook, fetchWithRetry: vi.fn() };
});

describe("Ledger Entry Update Action", () => {
  let testLedgerId: string;
  let testEntryId: string;
  let testCategoryId: string;
  let testSourceDocId: string;

  beforeEach(async () => {
    const db = getTestDb();

    // Clean up existing ledger for TEST_USER_ID and create new one
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    const [category] = await db
      .insert(entryCategories)
      .values({ ledgerId: testLedgerId, name: "Dining", sortOrder: 1 })
      .returning();
    expect(category).toBeDefined();
    if (category === undefined) {
      throw new Error("Expected category insert to return a row");
    }
    testCategoryId = category.id;

    // Create a test source document for entries
    testSourceDocId = await createTestSourceDocument(db, testLedgerId);

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId: testLedgerId,
        sourceDocumentId: testSourceDocId,
        amount: "100.00",
        currency: "CNY",
        itemName: "Test Item",
        description: "Initial description",
        categoryId: testCategoryId,
      })
      .returning();
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }
    testEntryId = entry.id;
    await activateTestSourceDocumentProjection(db, testSourceDocId);
  });

  it("should update description correctly", async () => {
    const newDescription = "Updated description";

    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        description: newDescription,
      },
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.description).toBe(newDescription);

    // Verify in DB
    const db = getTestDb();
    const [updatedEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.id, testEntryId));

    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.description).toBe(newDescription);
  });

  it("should update other fields correctly", async () => {
    const changes = {
      amount: "200",
      itemName: "Updated Item",
      currency: "USD",
    };

    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      changes,
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.amount).toBe("200.000");
    expect(result.itemName).toBe(changes.itemName);
    expect(result.currency).toBe(changes.currency);
  });

  it("should handle partial updates", async () => {
    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        itemName: "Only Name Changed",
      },
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.itemName).toBe("Only Name Changed");
    expect(result.amount).toBe("100.000"); // Original value
  });

  it("should recalculate convertedAmount and exchangeRate when currency changes", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        mainCurrency: "CNY",
      })
      .where(eq(ledgers.id, testLedgerId));

    // Update entry to use USD (different from main currency)
    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        currency: "USD",
        amount: "100",
      },
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.currency).toBe("USD");
    expect(result.amount).toBe("100.000");
    // Mock converts at 1 USD = 7 CNY
    expect(result.convertedAmount).toBe("700.000");
    expect(result.exchangeRate).toBe("7.000000000000");
  });

  it("should recalculate when amount changes with different currency", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        mainCurrency: "CNY",
      })
      .where(eq(ledgers.id, testLedgerId));

    // First set currency to USD and amount
    await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        currency: "USD",
        amount: "100",
      },
      crypto.randomUUID()
    );

    // Then update amount - should trigger recalculation
    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        amount: "200",
      },
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.amount).toBe("200.000");
    expect(result.currency).toBe("USD"); // Should retain USD
    // Mock converts at 1 USD = 7 CNY, so 200 USD = 1400 CNY
    expect(result.convertedAmount).toBe("1400.000");
    expect(result.exchangeRate).toBe("7.000000000000");
  });

  it("should set convertedAmount equal to amount when currency matches main currency", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        mainCurrency: "CNY",
      })
      .where(eq(ledgers.id, testLedgerId));

    // Update entry to use CNY (same as main currency)
    const result = await updateLedgerEntryAction(
      testLedgerId,
      testEntryId,
      {
        currency: "CNY",
        amount: "100",
      },
      crypto.randomUUID()
    );

    expect(result).toBeDefined();
    expect(result.currency).toBe("CNY");
    expect(result.amount).toBe("100.000");
    // When currencies match, convertedAmount should equal amount
    expect(result.convertedAmount).toBe("100.000");
    expect(result.exchangeRate).toBe("1");
  });
});
