import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { categories, ledgers } from "@/lib/db/schema";

describe("Categories Database Operations", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger" })
      .returning();
    testLedgerId = ledger.id;
  });

  describe("CREATE", () => {
    it("should create a category with required fields", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: testLedgerId,
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe("餐饮");
      expect(created.sortOrder).toBe(1);
      expect(created.ledgerId).toBe(testLedgerId);
    });

    it("should create a category with all fields", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: testLedgerId,
          name: "交通",
          description: "公交、地铁、打车",
          icon: "🚗",
          sortOrder: 2,
        })
        .returning();

      expect(created.description).toBe("公交、地铁、打车");
      expect(created.icon).toBe("🚗");
    });

    it("should create multiple categories", async () => {
      const db = getTestDb();
      await db.insert(categories).values([
        { ledgerId: testLedgerId, name: "Cat A", sortOrder: 10 },
        { ledgerId: testLedgerId, name: "Cat B", sortOrder: 11 },
        { ledgerId: testLedgerId, name: "Cat C", sortOrder: 12 },
      ]);

      const allCategories = await db.query.categories.findMany({
        where: eq(categories.ledgerId, testLedgerId),
      });
      expect(allCategories.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("READ", () => {
    it("should find category by id", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: testLedgerId,
          name: "Test Category",
          sortOrder: 1,
        })
        .returning();

      const found = await db.query.categories.findFirst({
        where: eq(categories.id, created.id),
      });

      expect(found).toBeDefined();
      expect(found?.name).toBe("Test Category");
    });
  });

  describe("UPDATE", () => {
    it("should update category name and description", async () => {
      const db = getTestDb();

      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: testLedgerId,
          name: "Original",
          sortOrder: 1,
        })
        .returning();

      const [updated] = await db
        .update(categories)
        .set({ name: "Updated", description: "New description" })
        .where(eq(categories.id, created.id))
        .returning();

      expect(updated.name).toBe("Updated");
      expect(updated.description).toBe("New description");
    });
  });

  describe("DELETE", () => {
    it("should delete category", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: testLedgerId,
          name: "To Delete",
          sortOrder: 1,
        })
        .returning();

      await db.delete(categories).where(eq(categories.id, created.id));

      const found = await db.query.categories.findFirst({
        where: eq(categories.id, created.id),
      });

      expect(found).toBeUndefined();
    });
  });
});
