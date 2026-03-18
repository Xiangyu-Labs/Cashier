import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories, ledgers } from "@/persistence";
import { eq } from "drizzle-orm";
import {
  createTestUserWithLedger,
  createTestSourceDocument,
  TEST_USER_ID,
} from "../../helpers/schema-setup";

// Mock the exchange rate service
vi.mock("@/features/currency/server/exchange-rate-service", () => ({
  ExchangeRateService: {
    convert: vi.fn().mockImplementation((amount: number) => {
      // Mock: 1 USD = 7 CNY
      return Promise.resolve(amount * 7);
    }),
  },
}));

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
    testCategoryId = category.id;

    // Create a test source document for entries
    testSourceDocId = await createTestSourceDocument(db, testLedgerId);

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId: testLedgerId,
        sourceDocumentId: testSourceDocId,
        amount: "100.00",
        itemName: "Test Item",
        description: "Initial description",
        categoryId: testCategoryId,
      })
      .returning();
    testEntryId = entry.id;
  });

  it("should update description correctly", async () => {
    const newDescription = "Updated description";

    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, {
      description: newDescription,
    });

    expect(result).toBeDefined();
    expect(result.description).toBe(newDescription);

    // Verify in DB
    const db = getTestDb();
    const [updatedEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.id, testEntryId));

    expect(updatedEntry.description).toBe(newDescription);
  });

  it("should update other fields correctly", async () => {
    const changes = {
      amount: 200,
      itemName: "Updated Item",
      currency: "USD",
    };

    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, changes);

    expect(result).toBeDefined();
    expect(result.amount).toBe("200.00");
    expect(result.itemName).toBe(changes.itemName);
    expect(result.currency).toBe(changes.currency);
  });

  it("should handle partial updates", async () => {
    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, {
      itemName: "Only Name Changed",
    });

    expect(result).toBeDefined();
    expect(result.itemName).toBe("Only Name Changed");
    expect(result.amount).toBe("100.00"); // Original value
  });

  it("should recalculate convertedAmount and exchangeRate when currency changes", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        metadata: {
          settings: {
            mainCurrency: "CNY",
          },
        },
      })
      .where(eq(ledgers.id, testLedgerId));

    // Update entry to use USD (different from main currency)
    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, {
      currency: "USD",
      amount: 100,
    });

    expect(result).toBeDefined();
    expect(result.currency).toBe("USD");
    expect(result.amount).toBe("100.00");
    // Mock converts at 1 USD = 7 CNY
    expect(result.convertedAmount).toBe("700.00");
    expect(result.exchangeRate).toBe("7.000000");
  });

  it("should recalculate when amount changes with different currency", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        metadata: {
          settings: {
            mainCurrency: "CNY",
          },
        },
      })
      .where(eq(ledgers.id, testLedgerId));

    // First set currency to USD and amount
    await updateLedgerEntryAction(testLedgerId, testEntryId, {
      currency: "USD",
      amount: 100,
    });

    // Then update amount - should trigger recalculation
    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, {
      amount: 200,
    });

    expect(result).toBeDefined();
    expect(result.amount).toBe("200.00");
    expect(result.currency).toBe("USD"); // Should retain USD
    // Mock converts at 1 USD = 7 CNY, so 200 USD = 1400 CNY
    expect(result.convertedAmount).toBe("1400.00");
    expect(result.exchangeRate).toBe("7.000000");
  });

  it("should set convertedAmount equal to amount when currency matches main currency", async () => {
    const db = getTestDb();

    // Set ledger's main currency to CNY
    await db
      .update(ledgers)
      .set({
        metadata: {
          settings: {
            mainCurrency: "CNY",
          },
        },
      })
      .where(eq(ledgers.id, testLedgerId));

    // Update entry to use CNY (same as main currency)
    const result = await updateLedgerEntryAction(testLedgerId, testEntryId, {
      currency: "CNY",
      amount: 100,
    });

    expect(result).toBeDefined();
    expect(result.currency).toBe("CNY");
    expect(result.amount).toBe("100.00");
    // When currencies match, convertedAmount should equal amount
    expect(result.convertedAmount).toBe("100.00");
    expect(result.exchangeRate).toBe("1");
  });
});
