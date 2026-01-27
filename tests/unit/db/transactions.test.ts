import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, categories, transactions, inputMessages } from "@/lib/db/schema";

describe("Transactions Database Operations", () => {
  describe("CREATE", () => {
    it("should create a transaction with required fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          amount: "25.50",
          itemName: "午餐",
          sourceType: "text",
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.amount).toBe("25.50");
      expect(created.itemName).toBe("午餐");
      expect(created.status).toBe("pending");
      expect(created.sourceType).toBe("text");
    });

    it("should create a transaction with category", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [category] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "30.00",
          itemName: "晚餐",
          sourceType: "text",
        })
        .returning();

      expect(created.categoryId).toBe(category.id);
    });

    it("should create a transaction with metadata", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const metadata = {
        quantity: 2,
        unit: "kg",
        unitPrice: 10,
        originalName: "红富士苹果"
      };

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          amount: "20.00",
          itemName: "苹果",
          sourceType: "text",
          metadata
        })
        .returning();

      expect(created.metadata).toEqual(metadata);
    });

    it("should create a transaction with all fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [message] = await db
        .insert(inputMessages)
        .values({
          ledgerId: ledger.id,
          text: "午餐25.5元",
        })
        .returning();

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          inputMessageId: message.id,
          amount: "25.50",
          currency: "CNY",
          itemName: "午餐",
          description: "在公司附近吃的",
          status: "pending",
          sourceType: "text",
          transactionDate: new Date("2025-01-25"),
        })
        .returning();

      expect(created.currency).toBe("CNY");
      expect(created.description).toBe("在公司附近吃的");
      expect(created.inputMessageId).toBe(message.id);
      expect(created.transactionDate).toEqual(new Date("2025-01-25"));
    });
  });

  describe("READ", () => {
    it("should find transactions by ledger id", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(transactions).values([
        { ledgerId: ledger.id, amount: "10.00", itemName: "Item 1", sourceType: "text" },
        { ledgerId: ledger.id, amount: "20.00", itemName: "Item 2", sourceType: "text" },
      ]);

      const found = await db.query.transactions.findMany({
        where: eq(transactions.ledgerId, ledger.id),
      });

      expect(found).toHaveLength(2);
    });

    it("should find transaction with category relation", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [category] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      const [tx] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "25.00",
          itemName: "午餐",
          sourceType: "text",
        })
        .returning();

      const found = await db.query.transactions.findFirst({
        where: eq(transactions.id, tx.id),
        with: { category: true },
      });

      expect(found?.category).toBeDefined();
      expect(found?.category?.name).toBe("餐饮");
    });

    it("should filter transactions by status", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(transactions).values([
        { ledgerId: ledger.id, amount: "10.00", itemName: "Pending", status: "pending", sourceType: "text" },
        { ledgerId: ledger.id, amount: "20.00", itemName: "Confirmed", status: "confirmed", sourceType: "text" },
      ]);

      const pending = await db.query.transactions.findMany({
        where: eq(transactions.status, "pending"),
      });

      const confirmed = await db.query.transactions.findMany({
        where: eq(transactions.status, "confirmed"),
      });

      expect(pending).toHaveLength(1);
      expect(pending[0].itemName).toBe("Pending");
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].itemName).toBe("Confirmed");
    });
  });

  describe("UPDATE", () => {
    it("should update transaction status to confirmed", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          amount: "25.00",
          itemName: "午餐",
          sourceType: "text",
        })
        .returning();

      expect(created.status).toBe("pending");

      const [updated] = await db
        .update(transactions)
        .set({ status: "confirmed" })
        .where(eq(transactions.id, created.id))
        .returning();

      expect(updated.status).toBe("confirmed");
    });
  });

  describe("DELETE", () => {
    it("should delete transaction", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          amount: "25.00",
          itemName: "To Delete",
          sourceType: "text",
          status: "pending"
        })
        .returning();

      await db.delete(transactions).where(eq(transactions.id, created.id));

      const found = await db.query.transactions.findFirst({
        where: eq(transactions.id, created.id),
      });

      expect(found).toBeUndefined();
    });

    it("should cascade delete transactions when ledger is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(transactions).values({
        ledgerId: ledger.id,
        amount: "25.00",
        itemName: "Will Be Deleted",
        sourceType: "text",
      });

      await db.delete(ledgers).where(eq(ledgers.id, ledger.id));

      const orphaned = await db.query.transactions.findMany({
        where: eq(transactions.ledgerId, ledger.id),
      });

      expect(orphaned).toHaveLength(0);
    });

    it("should set categoryId to null when category is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [category] = await db
        .insert(categories)
        .values({
          ledgerId: ledger.id,
          name: "餐饮",
          sortOrder: 1,
        })
        .returning();

      const [tx] = await db
        .insert(transactions)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "25.00",
          itemName: "午餐",
          sourceType: "text",
        })
        .returning();

      await db.delete(categories).where(eq(categories.id, category.id));

      const found = await db.query.transactions.findFirst({
        where: eq(transactions.id, tx.id),
      });

      expect(found).toBeDefined();
      expect(found?.categoryId).toBeNull();
    });
  });
});
