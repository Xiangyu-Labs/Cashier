import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories as categories, ledgerEntries, sourceDocuments as receipts } from "@/lib/db/schema";

describe("LedgerEntries Database Operations", () => {
  describe("CREATE", () => {
    it("should create a ledger entry with required fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          amount: "25.50",
          itemName: "午餐",
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.amount).toBe("25.50");
      expect(created.itemName).toBe("午餐");
    });

    it("should create a ledger entry with category", async () => {
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
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "30.00",
          itemName: "晚餐",
        })
        .returning();

      expect(created.categoryId).toBe(category.id);
    });

    it("should create a ledger entry with all fields", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [receipt] = await db
        .insert(receipts)
        .values({
          ledgerId: ledger.id,
          text: "午餐25.5元",
        })
        .returning();

      const [created] = await db
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          sourceDocumentId: receipt.id,
          amount: "25.50",
          currency: "CNY",
          itemName: "午餐",
          description: "在公司附近吃的",
          entryDate: new Date("2025-01-25"),
        })
        .returning();

      expect(created.currency).toBe("CNY");
      expect(created.description).toBe("在公司附近吃的");
      expect(created.sourceDocumentId).toBe(receipt.id);
      expect(created.entryDate).toEqual(new Date("2025-01-25"));
    });
  });

  describe("READ", () => {
    it("should find ledger entries by ledger id", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(ledgerEntries).values([
        { ledgerId: ledger.id, amount: "10.00", itemName: "Item 1" },
        { ledgerId: ledger.id, amount: "20.00", itemName: "Item 2" },
      ]);

      const found = await db.query.ledgerEntries.findMany({
        where: eq(ledgerEntries.ledgerId, ledger.id),
      });

      expect(found).toHaveLength(2);
    });

    it("should find ledger entry with category relation", async () => {
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
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "25.00",
          itemName: "午餐",
        })
        .returning();

      const found = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, tx.id),
        with: { category: true },
      });

      expect(found?.category).toBeDefined();
      expect(found?.category?.name).toBe("餐饮");
    });
  });

  describe("UPDATE", () => {
    // Status update test removed as status is removed from transactions
    // We can test updating other fields like description or amount
    it("should update ledger entry description", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          amount: "25.00",
          itemName: "午餐",
        })
        .returning();

      const [updated] = await db
        .update(ledgerEntries)
        .set({ description: "Updated Note" })
        .where(eq(ledgerEntries.id, created.id))
        .returning();

      expect(updated.description).toBe("Updated Note");
    });
  });

  describe("DELETE", () => {
    it("should delete ledger entry", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          amount: "25.00",
          itemName: "To Delete",
        })
        .returning();

      await db.delete(ledgerEntries).where(eq(ledgerEntries.id, created.id));

      const found = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, created.id),
      });

      expect(found).toBeUndefined();
    });

    it("should cascade delete ledger entries when ledger is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(ledgerEntries).values({
        ledgerId: ledger.id,
        amount: "25.00",
        itemName: "Will Be Deleted",
      });

      await db.delete(ledgers).where(eq(ledgers.id, ledger.id));

      const orphaned = await db.query.ledgerEntries.findMany({
        where: eq(ledgerEntries.ledgerId, ledger.id),
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
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          categoryId: category.id,
          amount: "25.00",
          itemName: "午餐",
        })
        .returning();

      await db.delete(categories).where(eq(categories.id, category.id));

      const found = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, tx.id),
      });

      expect(found).toBeDefined();
      expect(found?.categoryId).toBeNull();
    });
  });
});
