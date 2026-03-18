import { describe, it, expect, beforeEach } from "vitest";
import { getLedgerEntriesAction } from "@/modules/ledger/actions";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories, ledgerEntries } from "@/persistence";
import {
  createTestUserWithLedger,
  createTestSourceDocument,
  TEST_USER_ID,
} from "../../helpers/schema-setup";
import { eq } from "drizzle-orm";

describe("getLedgerEntriesAction", () => {
  let testLedgerId: string;
  let testCategoryId: string;
  let testSourceDocId: string;

  beforeEach(async () => {
    const db = getTestDb();

    // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
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

    // Create a test source document for entries
    testSourceDocId = await createTestSourceDocument(db, testLedgerId);
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
      sourceDocumentId: testSourceDocId,
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
      {
        ledgerId: testLedgerId,
        categoryId: testCategoryId,
        sourceDocumentId: testSourceDocId,
        amount: "10",
        itemName: "餐饮交易",
      },
      {
        ledgerId: testLedgerId,
        categoryId: otherCategory.id,
        sourceDocumentId: testSourceDocId,
        amount: "20",
        itemName: "交通交易",
      },
    ]);

    const data = await getLedgerEntriesAction(testLedgerId, { categoryId: testCategoryId });

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("餐饮交易");
  });
});
