import { describe, it, expect, beforeEach } from "vitest";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { entryCategories, ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("getLedgerEntriesAction", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    const db = getTestDb();

    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;

    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId: testLedgerId,
        name: "餐饮",
        sortOrder: 1,
      })
      .returning();
    testCategoryId = category.id;
  });

  it("should return empty array when no ledger entries exist", async () => {
    const data = await getLedgerEntriesAction(testLedgerId, {});

    expect(data.items).toEqual([]);
    expect(data.nextCursor).toBeUndefined();
  });

  it("should return ledger entries with category relation", async () => {
    const db = getTestDb();
    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      amount: "25.50",
      itemName: "午餐",
    });

    const data = await getLedgerEntriesAction(testLedgerId, {});

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("午餐");
    expect(data.items[0].category).toBeDefined();
    expect(data.items[0].category!.name).toBe("餐饮");
  });

  it("should filter by categoryId", async () => {
    const db = getTestDb();
    const [otherCategory] = await db
      .insert(entryCategories)
      .values({ ledgerId: testLedgerId, name: "交通", sortOrder: 2 })
      .returning();

    await db.insert(ledgerEntries).values([
      { ledgerId: testLedgerId, categoryId: testCategoryId, amount: "10", itemName: "餐饮交易" },
      { ledgerId: testLedgerId, categoryId: otherCategory.id, amount: "20", itemName: "交通交易" },
    ]);

    const data = await getLedgerEntriesAction(testLedgerId, { categoryId: testCategoryId });

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("餐饮交易");
  });
});
