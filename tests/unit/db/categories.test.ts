import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { categories } from "@/lib/db/schema";

describe("Categories Database Operations", () => {
  describe("CREATE", () => {
    it("should create a category with required fields", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe("餐饮");
      expect(created.sortOrder).toBe(1);
    });

    it("should create a category with all fields", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
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
        { name: "Cat A", sortOrder: 10 }, // naming strictly to avoid clash with defaults like "餐饮" which might already exist and cause duplicate logic/error if unique constraint (no unique on name currently)
        { name: "Cat B", sortOrder: 11 },
        { name: "Cat C", sortOrder: 12 },
      ]);

      const allCategories = await db.query.categories.findMany();
      expect(allCategories.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("READ", () => {
    it("should find category by id", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(categories)
        .values({
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
