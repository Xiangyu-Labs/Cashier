import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers } from "@/lib/db/schema";
import { createTestUser, createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Ledgers Database Operations", () => {
  describe("CREATE", () => {
    it("should create a ledger with default values", async () => {
      const db = getTestDb();
      const userId = await createTestUser(db);
      const [created] = await db
        .insert(ledgers)
        .values({ name: "My Ledger", userId })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe("My Ledger");
      expect(created.userId).toBe(userId);
      expect(created.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("READ", () => {
    it("should find ledger by id", async () => {
      const db = getTestDb();
      const { ledgerId, userId } = await createTestUserWithLedger(db, "test@example.com", "Find Me");

      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
      });

      expect(found).toBeDefined();
      expect(found?.name).toBe("Find Me");
      expect(found?.userId).toBe(userId);
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
      const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Original");

      const original = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
      });

      const [updated] = await db
        .update(ledgers)
        .set({ name: "Updated", updatedAt: new Date() })
        .where(eq(ledgers.id, ledgerId))
        .returning();

      expect(updated.name).toBe("Updated");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        original!.updatedAt.getTime()
      );
    });
  });

  describe("DELETE", () => {
    it("should delete ledger", async () => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "To Delete");

      await db.delete(ledgers).where(eq(ledgers.id, ledgerId));

      const found = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
      });

      expect(found).toBeUndefined();
    });
  });
});
