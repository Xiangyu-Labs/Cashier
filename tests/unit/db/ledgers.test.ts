import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, categories, DEFAULT_CATEGORIES } from "@/lib/db/schema";

describe("Ledgers Database Operations", () => {
  describe("CREATE", () => {
    it("should create a ledger with default values", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(ledgers)
        .values({ name: "My Ledger" })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe("My Ledger");
      expect(created.language).toBe("zh-CN");
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it("should create a ledger with custom language", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(ledgers)
        .values({ name: "English Ledger", language: "en" })
        .returning();

      expect(created.language).toBe("en");
    });
  });

  describe("READ", () => {
    it("should find ledger by id", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(ledgers)
        .values({ name: "Find Me" })
        .returning();

      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, created.id),
      });

      expect(found).toBeDefined();
      expect(found?.name).toBe("Find Me");
    });

    it("should return undefined for non-existent id", async () => {
      const db = getTestDb();
      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, "00000000-0000-0000-0000-000000000000"),
      });

      expect(found).toBeUndefined();
    });

    it("should find ledger with categories relation", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "With Categories" })
        .returning();

      await db.insert(categories).values({
        ledgerId: ledger.id,
        name: "Test Category",
        sortOrder: 1,
      });

      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledger.id),
        with: { categories: true },
      });

      expect(found?.categories).toHaveLength(1);
      expect(found?.categories[0].name).toBe("Test Category");
    });
  });

  describe("UPDATE", () => {
    it("should update ledger name", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(ledgers)
        .values({ name: "Original" })
        .returning();

      const [updated] = await db
        .update(ledgers)
        .set({ name: "Updated", updatedAt: new Date() })
        .where(eq(ledgers.id, created.id))
        .returning();

      expect(updated.name).toBe("Updated");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime()
      );
    });
  });

  describe("DELETE", () => {
    it("should delete ledger", async () => {
      const db = getTestDb();
      const [created] = await db
        .insert(ledgers)
        .values({ name: "To Delete" })
        .returning();

      await db.delete(ledgers).where(eq(ledgers.id, created.id));

      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, created.id),
      });

      expect(found).toBeUndefined();
    });

    it("should cascade delete categories when ledger is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "With Categories" })
        .returning();

      await db.insert(categories).values({
        ledgerId: ledger.id,
        name: "Will Be Deleted",
        sortOrder: 1,
      });

      await db.delete(ledgers).where(eq(ledgers.id, ledger.id));

      const orphanedCategories = await db.query.categories.findMany({
        where: eq(categories.ledgerId, ledger.id),
      });

      expect(orphanedCategories).toHaveLength(0);
    });
  });

  describe("DEFAULT_CATEGORIES", () => {
    it("should have predefined categories", () => {
      expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
      expect(DEFAULT_CATEGORIES.map((c) => c.name)).toContain("餐饮");
      expect(DEFAULT_CATEGORIES.map((c) => c.name)).toContain("交通");
    });
  });
});
