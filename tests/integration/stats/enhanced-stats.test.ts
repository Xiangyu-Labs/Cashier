import { describe, it, expect, beforeEach } from "vitest";
import { getEnhancedStats } from "@/modules/stats/actions";
import { ValidationError } from "@/lib/errors";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/persistence";

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

function normalizeSql(sqlStatement: string): string {
  return sqlStatement.toLowerCase().replace(/\s+/g, " ").trim();
}

async function captureSqlStatements<T>(
  fn: () => Promise<T>
): Promise<{ result: T; statements: string[] }> {
  const dbWithClient = getTestDb() as unknown as {
    $client?: { prepare: (sql: string, ...args: unknown[]) => unknown };
  };
  const client = dbWithClient.$client;
  if (client == null) {
    throw new Error("Expected drizzle client to exist in integration tests");
  }

  const originalPrepare = client.prepare.bind(client);
  const statements: string[] = [];

  client.prepare = ((sqlStatement: string, ...args: unknown[]) => {
    statements.push(sqlStatement);
    return originalPrepare(sqlStatement, ...args);
  }) as typeof client.prepare;

  try {
    const result = await fn();
    return { result, statements };
  } finally {
    client.prepare = originalPrepare;
  }
}

describe("Enhanced Stats Actions", () => {
  let testLedgerId: string;
  let testCategoryId: string;
  let otherCategoryId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger");
    testLedgerId = ledgerId;

    // Create test categories
    const createdCategory1 = await db
      .insert(entryCategories)
      .values({
        name: "餐饮",
        description: "餐饮消费",
        sortOrder: 1,
        ledgerId: testLedgerId,
      })
      .returning();
    const category1 = requireFirst(createdCategory1, "category");
    testCategoryId = category1.id;

    const createdCategory2 = await db
      .insert(entryCategories)
      .values({
        name: "交通",
        description: "交通费用",
        sortOrder: 2,
        ledgerId: testLedgerId,
      })
      .returning();
    const category2 = requireFirst(createdCategory2, "category");
    otherCategoryId = category2.id;
  });

  describe("getEnhancedStats", () => {
    it("rejects invalid ledger ids", async () => {
      await expect(
        getEnhancedStats({
          ledgerId: "not-a-uuid",
          queryRange: { from: "2024-01-01", to: "2024-01-31" },
          compareRange: { from: "2023-12-01", to: "2023-12-31" },
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects invalid date ranges", async () => {
      await expect(
        getEnhancedStats({
          ledgerId: testLedgerId,
          queryRange: { from: "bad", to: "bad" },
          compareRange: { from: "bad", to: "bad" },
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects reversed date ranges", async () => {
      await expect(
        getEnhancedStats({
          ledgerId: testLedgerId,
          queryRange: { from: "2024-03-31", to: "2024-03-01" },
          compareRange: { from: "2024-02-29", to: "2024-02-01" },
        })
      ).rejects.toThrow(ValidationError);
    });

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
      const createdDocA = await db
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
      const docA = requireFirst(createdDocA, "source document");

      // Create source document with entryDate in March but created in January
      const createdDocB = await db
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
      const docB = requireFirst(createdDocB, "source document");

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
      const januaryPoint = requireFirst(result.chart, "chart point");
      expect(januaryPoint.date).toBe("2024-01-15");
      expect(januaryPoint.total).toBe(100);
    });

    it("keeps ledger/date/deleted constraints inside SQL for entry fetches", async () => {
      const db = getTestDb();
      const createdDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "SQL filter test",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-05",
        })
        .returning();
      const doc = requireFirst(createdDoc, "source document");

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        amount: "10",
        currency: "CNY",
        itemName: "Filter Item",
        categoryId: testCategoryId,
      });

      const { statements } = await captureSqlStatements(() =>
        getEnhancedStats({
          ledgerId: testLedgerId,
          queryRange: { from: "2024-03-01", to: "2024-03-31" },
          compareRange: { from: "2024-02-01", to: "2024-02-29" },
        })
      );

      const entryQueries = statements
        .map(normalizeSql)
        .filter(
          (sqlStatement) =>
            sqlStatement.startsWith("select") && sqlStatement.includes('from "ledger_entries"')
        );

      expect(entryQueries.length).toBeGreaterThanOrEqual(2);
      for (const query of entryQueries.slice(0, 2)) {
        expect(query).toContain('"ledgerentries"."ledger_id" = ?');
        expect(query).toContain('"ledgerentries"."deleted_at" is null');
        expect(query).toContain('select "id" from "source_documents"');
        expect(query).toContain('"source_documents"."ledger_id" = ?');
        expect(query).toMatch(/"source_documents"\."status"\s*(<>|!=)\s*\?/);
        expect(query).toContain('"source_documents"."deleted_at" is null');
        expect(query).toContain('"source_documents"."entry_date" >= ?');
        expect(query).toContain('"source_documents"."entry_date" <= ?');
      }
    });

    it("should calculate correct summary totals", async () => {
      const db = getTestDb();

      // Create entries across different dates
      const dates = ["2024-03-01", "2024-03-05", "2024-03-10"];
      for (const date of dates) {
        const createdDoc = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `${date} expense`,
            status: "completed",
            imageUrls: [],
            entryDate: date,
          })
          .returning();
        const doc = requireFirst(createdDoc, "source document");

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

      const createdDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Multi-category expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();
      const doc = requireFirst(createdDoc, "source document");

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
      const createdCurrentDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Current period expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15",
        })
        .returning();
      const currentDoc = requireFirst(createdCurrentDoc, "source document");

      await db.insert(ledgerEntries).values({
        ledgerId: testLedgerId,
        sourceDocumentId: currentDoc.id,
        amount: "200",
        currency: "CNY",
        itemName: "Current Item",
        categoryId: testCategoryId,
      });

      // Create entries for previous period (February)
      const createdPrevDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Previous period expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-02-15",
        })
        .returning();
      const prevDoc = requireFirst(createdPrevDoc, "source document");

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
      const createdDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Daily expenses",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();
      const doc = requireFirst(createdDoc, "source document");

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

      const createdDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Mixed entries",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();
      const doc = requireFirst(createdDoc, "source document");

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
        const createdDoc = await db
          .insert(sourceDocuments)
          .values({
            ledgerId: testLedgerId,
            text: `${entry.date} expense`,
            status: "completed",
            imageUrls: [],
            entryDate: entry.date,
          })
          .returning();
        const doc = requireFirst(createdDoc, "source document");

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

      const createdDoc = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Uncategorized expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-01",
        })
        .returning();
      const doc = requireFirst(createdDoc, "source document");

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
      const uncategorizedCategory = requireFirst(result.categories, "category");
      expect(uncategorizedCategory.name).toBe("Uncategorized");
      expect(uncategorizedCategory.totalConverted).toBe(100);
    });
  });
});
