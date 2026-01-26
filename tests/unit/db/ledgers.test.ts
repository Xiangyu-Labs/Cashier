import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, categories } from "@/lib/db/schema";
// DEFAULT_CATEGORIES might still be exported but logic is different now.

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
      expect(created.createdAt).toBeInstanceOf(Date);
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
  });
});
