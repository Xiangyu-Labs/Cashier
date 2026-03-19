import { describe, it, expect, beforeEach } from "vitest";
import { getEnhancedStats } from "@/modules/stats/actions";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/persistence";

describe("Enhanced Stats Actions", () => {
  let testLedgerId: string;
  let testCategoryId: string;
  let otherCategoryId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger");
    testLedgerId = ledgerId;

    // Create test categories
    const [category1] = await db
      .insert(entryCategories)
      .values({
        name: "餐饮",
        description: "餐饮消费",
        sortOrder: 1,
        ledgerId: testLedgerId,
      })
      .returning();
    testCategoryId = category1.id;

    const [category2] = await db
      .insert(entryCategories)
      .values({
        name: "交通",
        description: "交通费用",
        sortOrder: 2,
        ledgerId: testLedgerId,
      })
      .returning();
    otherCategoryId = category2.id;
  });

  describe("getEnhancedStats", () => {
    it("rejects access to a ledger owned by another user", async () => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(
        db,
        undefined,
        undefined,
        "11111111-1111-4111-8111-111111111111"
      );

      await expect(
        getEnhancedStats({
          ledgerId,
          queryRange: { from: "2024-01-01", to: "2024-01-31" },
          compareRange: { from: "2023-12-01", to: "2023-12-31" },
        })
      ).rejects.toThrow("Ledger");
    });

    it("should filter by entryDate not createdAt", async () => {
      const db = getTestDb();

      // Create source document with entryDate in Jan but created in March
      const [docA] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "January expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-01-15",
          createdAt: new Date("2024-03-01"),
        })
        .returning();

      // Create source document with entryDate in March but created in January
      const [docB] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "March expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15",
          createdAt: new Date("2024-01-01"),
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: docA.id,
        amount: "100",
        currency: "CNY",
        itemName: "Jan Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: docB.id,
        amount: "200",
        currency: "CNY",
        itemName: "Mar Item",
        categoryId: testCategoryId,
      });

      // Query for January 2024
      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-01-01", to: "2024-01-31" },
        compareRange: { from: "2023-12-01", to: "2023-12-31" },
      });

      // Should only include data from docA (entryDate in January)
      expect(result.summary.total).toBe(100);
      expect(result.chart).toHaveLength(1);
      expect(result.chart[0].date).toBe("2024-01-15");
      expect(result.chart[0].total).toBe(100);
    });

    it("should calculate correct summary totals", async () => {
      const db = getTestDb();

      // Create entries across different dates
      const dates = ["2024-03-01", "2024-03-05", "2024-03-10"];
      for (const date of dates) {
        const [doc] = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `${date} expense`,
            status: "completed",
            imageUrls: [],
            entryDate: date,
          })
          .returning();

        await db.insert(ledgerEntries).values({
          ledgerId: testLedgerId,
          sourceDocumentId: doc.id,
          amount: "100",
          currency: "CNY",
          itemName: `${date} Item`,
          categoryId: testCategoryId,
        });
      }

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      expect(result.summary.total).toBe(300);
      expect(result.summary.currency).toBe("CNY");
      expect(result.chart).toHaveLength(3);
    });

    it("should calculate category breakdown correctly", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Multi-category expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();

      // Add entries with different categories
      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "100",
        currency: "CNY",
        itemName: "Food Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "50",
        currency: "CNY",
        itemName: "Transport Item",
        categoryId: otherCategoryId,
      });

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      expect(result.categories).toHaveLength(2);

      const foodCategory = result.categories.find((c) => c.name === "餐饮");
      const transportCategory = result.categories.find((c) => c.name === "交通");

      expect(foodCategory).toBeDefined();
      expect(foodCategory?.totalConverted).toBe(100);
      expect(foodCategory?.percent).toBe((100 / 150) * 100);
      expect(foodCategory?.count).toBe(1);

      expect(transportCategory).toBeDefined();
      expect(transportCategory?.totalConverted).toBe(50);
      expect(transportCategory?.percent).toBe((50 / 150) * 100);
    });

    it("should calculate trend correctly", async () => {
      const db = getTestDb();

      // Create entries for current period (March)
      const [currentDoc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Current period expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: currentDoc.id,
        amount: "200",
        currency: "CNY",
        itemName: "Current Item",
        categoryId: testCategoryId,
      });

      // Create entries for previous period (February)
      const [prevDoc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Previous period expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-02-15",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: prevDoc.id,
        amount: "100",
        currency: "CNY",
        itemName: "Previous Item",
        categoryId: testCategoryId,
      });

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      // Trend from 100 to 200 is 100% increase
      expect(result.summary.trend.amount).toBe(100);
      expect(result.summary.trend.percent).toBe(100);
    });

    it("should calculate daily average correctly", async () => {
      const db = getTestDb();

      // Create multiple entries on the same day
      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Daily expenses",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "300",
        currency: "CNY",
        itemName: "Items",
        categoryId: testCategoryId,
      });

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      // Daily average = Total / Days in range = 300 / 31
      expect(result.summary.dailyAverage).toBeCloseTo(300 / 31, 2);
    });

    it("should exclude deleted entries", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Mixed entries",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "100",
        currency: "CNY",
        itemName: "Active Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "200",
        currency: "CNY",
        itemName: "Deleted Item",
        categoryId: testCategoryId,
        deletedAt: new Date(),
      });

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      expect(result.summary.total).toBe(100);
    });

    it("should generate correct heatmap data", async () => {
      const db = getTestDb();

      // Create entries across different dates
      const entries = [
        { date: "2024-03-01", amount: "50" },
        { date: "2024-03-05", amount: "100" },
        { date: "2024-03-10", amount: "200" },
      ];

      for (const entry of entries) {
        const [doc] = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `${entry.date} expense`,
            status: "completed",
            imageUrls: [],
            entryDate: entry.date,
          })
          .returning();

        await db.insert(ledgerEntries).values({
          ledgerId: testLedgerId,
          sourceDocumentId: doc.id,
          amount: entry.amount,
          currency: "CNY",
          itemName: `${entry.date} Item`,
          categoryId: testCategoryId,
        });
      }

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      expect(result.heatmap.days).toHaveLength(3);
      expect(result.heatmap.stats.minAmount).toBe(50);
      expect(result.heatmap.stats.maxAmount).toBe(200);
      expect(result.heatmap.stats.avgAmount).toBeCloseTo(116.67, 2);
    });

    it("should handle uncategorized entries", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Uncategorized expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "100",
        currency: "CNY",
        itemName: "Uncategorized Item",
        categoryId: null, // No category
      });

      const result = await getEnhancedStats({
        ledgerId: testLedgerId,
        queryRange: { from: "2024-03-01", to: "2024-03-31" },
        compareRange: { from: "2024-02-01", to: "2024-02-29" },
      });

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].name).toBe("Uncategorized");
      expect(result.categories[0].totalConverted).toBe(100);
    });
  });
});
