import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories as categories, ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("LedgerEntries Database Operations", () => {
  describe("CREATE", () => {
    it("should create a ledger entry with required fields", async () => {
      const db = getTestDb();
      const { ledgerId: id } = await createTestUserWithLedger(db, "test1@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test2@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test3@example.com", "Test Ledger");
      const ledger = { id };

      const [sourceDocument] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: ledger.id,
          text: "午餐25.5元",
        })
        .returning();

      const [created] = await db
        .insert(ledgerEntries)
        .values({
          ledgerId: ledger.id,
          sourceDocumentId: sourceDocument.id,
          amount: "25.50",
          currency: "CNY",
          itemName: "午餐",
          description: "在公司附近吃的",
          entryDate: new Date("2025-01-25T00:00:00Z"),
        })
        .returning();

      expect(created.currency).toBe("CNY");
      expect(created.description).toBe("在公司附近吃的");
      expect(created.sourceDocumentId).toBe(sourceDocument.id);
      expect(created.entryDate).toEqual(new Date("2025-01-25T00:00:00Z"));
    });
  });

  describe("READ", () => {
    it("should find ledger entries by ledger id", async () => {
      const db = getTestDb();
      const { ledgerId: id } = await createTestUserWithLedger(db, "test4@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test5@example.com", "Test Ledger");
      const ledger = { id };

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
    // Status update test removed as status is removed from ledger_entries
    // We can test updating other fields like description or amount
    it("should update ledger entry description", async () => {
      const db = getTestDb();
      const { ledgerId: id } = await createTestUserWithLedger(db, "test6@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test7@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test8@example.com", "Test Ledger");
      const ledger = { id };

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
      const { ledgerId: id } = await createTestUserWithLedger(db, "test9@example.com", "Test Ledger");
      const ledger = { id };

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
