import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, inputMessages } from "@/lib/db/schema";

describe("InputMessages Database Operations", () => {
  describe("CREATE", () => {
    it("should create a text input message", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          text: "午餐花了25.5元",
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.text).toBe("午餐花了25.5元");
      expect(created.imageUrls).toEqual([]);
      expect(created.aiResponse).toBeNull();
    });

    it("should create an image input message", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const imageUrl = "data:image/jpeg;base64,fake...";

      const [created] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          imageUrls: [imageUrl],
        })
        .returning();

      expect(created.text).toBeNull();
      expect(created.imageUrls).toHaveLength(1);
      expect(created.imageUrls![0]).toBe(imageUrl);
    });
  });

  describe("READ", () => {
    it("should find messages by ledger id", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(inputMessages).values([
        { ledgerId: ledger.id, text: "Message 1" },
        { ledgerId: ledger.id, text: "Message 2" },
      ]);

      const found = await db.query.inputMessages.findMany({
        where: eq(inputMessages.ledgerId, ledger.id),
      });

      expect(found).toHaveLength(2);
    });

    it("should find message with ledger relation", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Parent Ledger" })
        .returning();

      const [message] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          text: "Test message",
        })
        .returning();

      const found = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, message.id),
        with: { ledger: true },
      });

      expect(found?.ledger).toBeDefined();
      expect(found?.ledger.name).toBe("Parent Ledger");
    });
  });

  describe("UPDATE", () => {
    it("should update aiResponse after AI processing", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          text: "午餐25元",
        })
        .returning();

      expect(created.aiResponse).toBeNull();

      const aiResponse = JSON.stringify({
        transactions: [
          { item_name: "午餐", amount: 25, currency: "CNY", category: "餐饮", transaction_date: null },
        ],
      });

      const [updated] = await db
        .update(inputMessages)
        .set({ aiResponse })
        .where(eq(inputMessages.id, created.id))
        .returning();

      expect(updated.aiResponse).toBe(aiResponse);
    });
  });

  describe("DELETE", () => {
    it("should delete input message", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          text: "To delete",
        })
        .returning();

      await db.delete(inputMessages).where(eq(inputMessages.id, created.id));

      const found = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, created.id),
      });

      expect(found).toBeUndefined();
    });

    it("should cascade delete messages when ledger is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(inputMessages).values({
        ledgerId: ledger.id,
        text: "Will be deleted",
      });

      await db.delete(ledgers).where(eq(ledgers.id, ledger.id));

      const orphaned = await db.query.inputMessages.findMany({
        where: eq(inputMessages.ledgerId, ledger.id),
      });

      expect(orphaned).toHaveLength(0);
    });
  });
});
