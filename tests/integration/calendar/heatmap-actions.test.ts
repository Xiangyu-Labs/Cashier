import { describe, it, expect, beforeEach } from "vitest";
import {
  getCalendarHeatmapData,
  getCalendarDayDetail,
  getCalendarHeatmapForRange,
} from "@/features/calendar/server/actions/heatmap";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";

describe("Calendar Heatmap Actions", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;

    // Create a test category
    const [category] = await db
      .insert(entryCategories)
      .values({
        name: "餐饮",
        description: "餐饮消费",
        sortOrder: 1,
        ledgerId: testLedgerId,
      })
      .returning();
    testCategoryId = category.id;
  });

  describe("getCalendarHeatmapData", () => {
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

      // Create ledger entries for both documents
      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: docA.id,
        amount: "100",
        currency: "CNY",
        itemName: "January Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: docB.id,
        amount: "200",
        currency: "CNY",
        itemName: "March Item",
        categoryId: testCategoryId,
      });

      // Query for January 2024
      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-01-01",
      });

      // Should only include data from docA (entryDate in January)
      expect(result.days).toHaveLength(1);
      expect(result.days[0].date).toBe("2024-01-15");
      expect(result.days[0].totalAmount).toBe(100);
    });

    it("should return correct data for month view", async () => {
      const db = getTestDb();

      // Create multiple entries across different dates
      const [doc1] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Expense 1",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();

      const [doc2] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Expense 2",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01", // Same date
        })
        .returning();

      const [doc3] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Expense 3",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15", // Different date
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc1.id,
        amount: "50",
        currency: "CNY",
        itemName: "Item 1",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc2.id,
        amount: "50",
        currency: "CNY",
        itemName: "Item 2",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc3.id,
        amount: "100",
        currency: "CNY",
        itemName: "Item 3",
        categoryId: testCategoryId,
      });

      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
      });

      // Should aggregate entries by date
      expect(result.days).toHaveLength(2);

      const day1 = result.days.find((d) => d.date === "2024-03-01");
      const day15 = result.days.find((d) => d.date === "2024-03-15");

      expect(day1).toBeDefined();
      expect(day1?.totalAmount).toBe(100); // 50 + 50
      expect(day1?.entryCount).toBe(2);

      expect(day15).toBeDefined();
      expect(day15?.totalAmount).toBe(100);
      expect(day15?.entryCount).toBe(1);
    });

    it("should return correct data for year view", async () => {
      const db = getTestDb();

      // Create entries in different months
      const [doc1] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Jan expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-01-15",
        })
        .returning();

      const [doc2] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Jun expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-06-15",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc1.id,
        amount: "100",
        currency: "CNY",
        itemName: "Jan Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc2.id,
        amount: "200",
        currency: "CNY",
        itemName: "Jun Item",
        categoryId: testCategoryId,
      });

      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "year",
        anchorDate: "2024-01-01",
      });

      expect(result.days).toHaveLength(2);
      expect(result.range.startDate).toBe("2024-01-01");
      expect(result.range.endDate).toBe("2024-12-31");
    });

    it("should filter by currency", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Multi-currency expense",
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
        itemName: "CNY Item",
        categoryId: testCategoryId,
      });

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "50",
        currency: "USD",
        itemName: "USD Item",
        categoryId: testCategoryId,
      });

      const resultCNY = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
        filters: { currency: "CNY" },
      });

      expect(resultCNY.days).toHaveLength(1);
      expect(resultCNY.days[0].totalAmount).toBe(100);
      expect(resultCNY.days[0].currencies).toContain("CNY");
    });

    it("should filter by category", async () => {
      const db = getTestDb();

      // Create another category
      const [otherCategory] = await db
        .insert(entryCategories)
        .values({
          name: "交通",
          description: "交通费用",
          sortOrder: 2,
          ledgerId: testLedgerId,
        })
        .returning();

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
        categoryId: otherCategory.id,
      });

      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
        filters: { categoryId: testCategoryId },
      });

      expect(result.days).toHaveLength(1);
      expect(result.days[0].totalAmount).toBe(100);
    });

    it("should calculate correct stats for color mapping", async () => {
      const db = getTestDb();

      // Create entries with varying amounts
      for (let i = 1; i <= 5; i++) {
        const [doc] = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `Expense ${i}`,
            status: "completed",
            imageUrls: [],
            entryDate: `2024-03-${String(i).padStart(2, "0")}`,
          })
          .returning();

        await db.insert(ledgerEntries).values({
          ledgerId: testLedgerId,
          sourceDocumentId: doc.id,
          amount: String(i * 100), // 100, 200, 300, 400, 500
          currency: "CNY",
          itemName: `Item ${i}`,
          categoryId: testCategoryId,
        });
      }

      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
      });

      expect(result.stats.minAmount).toBe(100);
      expect(result.stats.maxAmount).toBe(500);
      expect(result.stats.avgAmount).toBe(300);
    });

    it("should exclude deleted entries", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Expense",
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

      const result = await getCalendarHeatmapData({
        ledgerId: testLedgerId,
        viewType: "month",
        anchorDate: "2024-03-01",
      });

      expect(result.days).toHaveLength(1);
      expect(result.days[0].totalAmount).toBe(100); // Excludes deleted entry
    });
  });

  describe("getCalendarDayDetail", () => {
    it("should return entries for specific date", async () => {
      const db = getTestDb();

      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Daily expenses",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15",
          title: "March 15 Expenses",
        })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "150",
        currency: "CNY",
        itemName: "Lunch",
        categoryId: testCategoryId,
      });

      const result = await getCalendarDayDetail({
        ledgerId: testLedgerId,
        date: "2024-03-15",
      });

      expect(result.date).toBe("2024-03-15");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].itemName).toBe("Lunch");
      expect(result.entries[0].amount).toBe(150);
      expect(result.totalAmount).toBe(150);
      expect(result.totalCount).toBe(1);
    });

    it("should filter day detail by entryDate not createdAt", async () => {
      const db = getTestDb();

      const [docA] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Jan expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-01-15",
          createdAt: new Date("2024-03-01"),
        })
        .returning();

      const [docB] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Mar expense",
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

      const result = await getCalendarDayDetail({
        ledgerId: testLedgerId,
        date: "2024-01-15",
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].itemName).toBe("Jan Item");
    });
  });

  describe("getCalendarHeatmapForRange", () => {
    it("should filter by entryDate not createdAt for custom range", async () => {
      const db = getTestDb();

      const [docA] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Jan expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-01-15",
          createdAt: new Date("2024-06-01"),
        })
        .returning();

      const [docB] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Jun expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-06-15",
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
        itemName: "Jun Item",
        categoryId: testCategoryId,
      });

      // Query for Q1 2024
      const result = await getCalendarHeatmapForRange({
        ledgerId: testLedgerId,
        startDate: "2024-01-01",
        endDate: "2024-03-31",
      });

      expect(result.days).toHaveLength(1);
      expect(result.days[0].date).toBe("2024-01-15");
      expect(result.days[0].totalAmount).toBe(100);
    });

    it("should respect custom date range", async () => {
      const db = getTestDb();

      // Create entries in Jan, Feb, Mar
      for (const [month, day] of [["01", "15"], ["02", "15"], ["03", "15"]]) {
        const [doc] = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `${month} expense`,
            status: "completed",
            imageUrls: [],
            entryDate: `2024-${month}-${day}`,
          })
          .returning();

        await db.insert(ledgerEntries).values({
          ledgerId: testLedgerId,
          sourceDocumentId: doc.id,
          amount: "100",
          currency: "CNY",
          itemName: `${month} Item`,
          categoryId: testCategoryId,
        });
      }

      // Query only for Jan-Feb
      const result = await getCalendarHeatmapForRange({
        ledgerId: testLedgerId,
        startDate: "2024-01-01",
        endDate: "2024-02-29",
      });

      expect(result.days).toHaveLength(2);
      expect(result.days.map((d) => d.date)).toContain("2024-01-15");
      expect(result.days.map((d) => d.date)).toContain("2024-02-15");
      expect(result.days.map((d) => d.date)).not.toContain("2024-03-15");
    });
  });
});
