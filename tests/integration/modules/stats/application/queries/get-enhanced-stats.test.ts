import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { currencyRates, entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { getEnhancedStats, getEnhancedStatsQuery } from "@/modules/stats/application/queries/get-enhanced-stats";

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first == null) {
    throw new Error(`Expected ${label}`);
  }
  return first;
}

describe("getEnhancedStatsQuery", () => {
  let ledgerId = "";
  let categoryId = "";

  beforeEach(async () => {
    const db = getTestDb();
    const setup = await createTestUserWithLedger(db);
    ledgerId = setup.ledgerId;

    const insertedCategories = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "餐饮",
        sortOrder: 1,
      })
      .returning();
    categoryId = requireFirst(insertedCategories, "category").id;
  });

  it("validates public query inputs before executing", async () => {
    await expect(
      getEnhancedStats({
        ledgerId: "not-a-uuid",
        queryRange: { from: "2024-03-31", to: "2024-03-01" },
        compareRange: { from: "2024-02-29", to: "2024-02-01" },
      })
    ).rejects.toThrow(ValidationError);
  });

  it("converts mixed currencies by entry date using ledger main currency", async () => {
    const db = getTestDb();
    await db
      .update(ledgers)
      .set({ metadata: { settings: { mainCurrency: "CNY" } } })
      .where(eq(ledgers.id, ledgerId));

    await db.insert(currencyRates).values([
      {
        date: "2024-03-01",
        base: "EUR",
        rates: { USD: 2, CNY: 4 },
      },
      {
        date: "2024-03-02",
        base: "EUR",
        rates: { USD: 2, CNY: 4 },
      },
    ]);

    const insertedDocs = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          text: "USD entry",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        },
        {
          ledgerId,
          text: "CNY entry",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-02",
        },
      ])
      .returning();

    const firstDoc = requireFirst(insertedDocs, "first document");
    const secondDoc = insertedDocs[1];
    if (secondDoc == null) {
      throw new Error("Expected second document");
    }

    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: firstDoc.id,
        amount: "20",
        currency: "USD",
        itemName: "USD item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: secondDoc.id,
        amount: "30",
        currency: "CNY",
        itemName: "CNY item",
        categoryId,
      },
    ]);

    const result = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2024-03-01", to: "2024-03-31" },
      compareRange: { from: "2024-02-01", to: "2024-02-29" },
    });

    expect(result.summary.currency).toBe("CNY");
    expect(result.summary.total).toBe(70);
    expect(result.chart).toEqual([
      { date: "2024-03-01", total: 40 },
      { date: "2024-03-02", total: 30 },
    ]);
  });

  it("filters out entries linked to soft-deleted source documents", async () => {
    const db = getTestDb();

    const insertedDocs = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          text: "active",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-05",
        },
        {
          ledgerId,
          text: "deleted",
          status: "deleted",
          imageUrls: [],
          entryDate: "2024-03-05",
        },
      ])
      .returning();

    const activeDoc = requireFirst(insertedDocs, "active document");
    const deletedDoc = insertedDocs[1];
    if (deletedDoc == null) {
      throw new Error("Expected deleted document");
    }

    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: activeDoc.id,
        amount: "100",
        currency: "CNY",
        itemName: "active item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: deletedDoc.id,
        amount: "999",
        currency: "CNY",
        itemName: "deleted item",
        categoryId,
      },
    ]);

    const result = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2024-03-01", to: "2024-03-31" },
      compareRange: { from: "2024-02-01", to: "2024-02-29" },
    });

    expect(result.summary.total).toBe(100);
    expect(result.heatmap.days).toHaveLength(1);
    expect(result.heatmap.days[0]?.totalAmount).toBe(100);
  });

  it("falls back to original amount when rates are missing and handles null currency", async () => {
    const db = getTestDb();
    await db
      .update(ledgers)
      .set({ metadata: { settings: { mainCurrency: "USD" } } })
      .where(eq(ledgers.id, ledgerId));

    await db.insert(currencyRates).values({
      date: "2024-04-01",
      base: "EUR",
      rates: { CNY: 7.8 },
    });

    const insertedDoc = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "fallback cases",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-04-01",
      })
      .returning();
    const doc = requireFirst(insertedDoc, "document");

    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: doc.id,
        amount: "50",
        currency: "JPY",
        itemName: "missing rate",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: doc.id,
        amount: "25",
        currency: null,
        itemName: "null currency",
        categoryId,
      },
    ]);

    const result = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2024-04-01", to: "2024-04-30" },
      compareRange: { from: "2024-03-01", to: "2024-03-31" },
    });

    expect(result.summary.currency).toBe("USD");
    expect(result.summary.total).toBe(75);
  });

  it("defaults summary currency to CNY when ledger main currency is absent", async () => {
    const db = getTestDb();

    const insertedDoc = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "default currency",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-05-01",
      })
      .returning();
    const doc = requireFirst(insertedDoc, "document");

    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: doc.id,
      amount: "10",
      currency: null,
      itemName: "default currency item",
      categoryId,
    });

    const result = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2024-05-01", to: "2024-05-31" },
      compareRange: { from: "2024-04-01", to: "2024-04-30" },
    });

    expect(result.summary.currency).toBe("CNY");
    expect(result.summary.total).toBe(10);
  });

  it("computes heatmap p80Amount using zero-based percentile indexing", async () => {
    const db = getTestDb();
    const dailyAmounts = [10, 20, 30, 40, 50];

    for (const [index, amount] of dailyAmounts.entries()) {
      const day = String(index + 1).padStart(2, "0");
      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId,
          text: `day-${day}`,
          status: "completed",
          imageUrls: [],
          entryDate: `2024-06-${day}`,
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId,
        sourceDocumentId: doc!.id,
        amount: String(amount),
        currency: "CNY",
        itemName: `item-${day}`,
        categoryId,
      });
    }

    const result = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2024-06-01", to: "2024-06-30" },
      compareRange: { from: "2024-05-01", to: "2024-05-31" },
    });

    expect(result.heatmap.stats.p80Amount).toBe(40);
  });

});
