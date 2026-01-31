import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { entryCategories as categories } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Categories Database Operations", () => {
  let testLedgerId: string;

  async function createCategory(overrides: Partial<typeof categories.$inferInsert> = {}) {
    const db = getTestDb();
    const [category] = await db
      .insert(categories)
      .values({
        ledgerId: testLedgerId,
        name: "Test Category",
        sortOrder: 1,
        ...overrides,
      })
      .returning();
    return category;
  }

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;
  });

  describe("CREATE", () => {
    it("should create a category with required fields", async () => {
      const created = await createCategory({ name: "餐饮" });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("餐饮");
      expect(created.sortOrder).toBe(1);
      expect(created.ledgerId).toBe(testLedgerId);
    });

    it("should create a category with all fields", async () => {
      const created = await createCategory({
        name: "交通",
        description: "公交、地铁、打车",
        icon: "🚗",
        sortOrder: 2,
      });

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

      const allCategories = await db.query.entryCategories.findMany({
        where: eq(categories.ledgerId, testLedgerId),
      });
      expect(allCategories.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("READ", () => {
    it("should find category by id", async () => {
      const db = getTestDb();
      const created = await createCategory();

      const found = await db.query.entryCategories.findFirst({
        where: eq(categories.id, created.id),
      });

      expect(found).toBeDefined();
      expect(found?.name).toBe("Test Category");
    });
  });

  describe("UPDATE", () => {
    it("should update category name and description", async () => {
      const db = getTestDb();
      const created = await createCategory({ name: "Original" });

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
      const created = await createCategory({ name: "To Delete" });

      await db.delete(categories).where(eq(categories.id, created.id));

      const found = await db.query.entryCategories.findFirst({
        where: eq(categories.id, created.id),
      });

      expect(found).toBeUndefined();
    });
  });
});
