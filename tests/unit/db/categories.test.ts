import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, categories } from "@/lib/db/schema";

describe("Categories Database Operations", () => {
  describe("CREATE", () => {
    it("should create a category with required fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe("餐饮");
      expect(created.ledgerId).toBe(ledger.id);
      expect(created.sortOrder).toBe(1);
    });

    it("should create a category with all fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "交通",
          description: "公交、地铁、打车",
          icon: "🚗",
          sortOrder: 2,
        })
        .returning();

      expect(created.description).toBe("公交、地铁、打车");
      expect(created.icon).toBe("🚗");
    });

    it("should create multiple categories for same ledger", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(categories).values([
        { ledgerId: ledger.id, name: "餐饮", sortOrder: 1 },
        { ledgerId: ledger.id, name: "交通", sortOrder: 2 },
        { ledgerId: ledger.id, name: "娱乐", sortOrder: 3 },
      ]);

      const allCategories = await db.query.categories.findMany({
        where: eq(categories.ledgerId, ledger.id),
      });

      expect(allCategories).toHaveLength(3);
    });
  });

  describe("READ", () => {
    it("should find categories by ledger id", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(categories).values({
        ledgerId: ledger.id,
        name: "Test Category",
        sortOrder: 1,
      });

      const found = await db.query.categories.findMany({
        where: eq(categories.ledgerId, ledger.id),
      });

      expect(found).toHaveLength(1);
      expect(found[0].name).toBe("Test Category");
    });

    it("should find category with ledger relation", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Parent Ledger" })
        .returning();

      const [category] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "Child Category",
          sortOrder: 1,
        })
        .returning();

      const found = await db.query.categories.findFirst({
        where: eq(categories.id, category.id),
        with: { ledger: true },
      });

      expect(found?.ledger).toBeDefined();
      expect(found?.ledger.name).toBe("Parent Ledger");
    });
  });

  describe("UPDATE", () => {
    it("should update category name and description", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
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
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
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
