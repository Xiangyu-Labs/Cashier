import { describe, it, expect, beforeEach } from "vitest";
import { batchUpdateLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories, ledgers } from "@/persistence";
import { inArray, eq } from "drizzle-orm";
import {
  createTestUserWithLedger,
  createTestSourceDocument,
  TEST_USER_ID,
} from "../../helpers/schema-setup";

describe("Batch Update Ledger Entries Action", () => {
  let testLedgerId: string;
  let testEntryIds: string[];
  let testCategoryId: string;
  let testSourceDocId: string;

  beforeEach(async () => {
    const db = getTestDb();

    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    const [category] = await db
      .insert(entryCategories)
      .values({ ledgerId: testLedgerId, name: "Dining", sortOrder: 1 })
      .returning();
    testCategoryId = category.id;

    // Create a test source document for entries
    testSourceDocId = await createTestSourceDocument(db, testLedgerId);

    const entries = await db
      .insert(ledgerEntries)
      .values([
        {
          ledgerId: testLedgerId,
          sourceDocumentId: testSourceDocId,
          amount: "100",
          itemName: "Item 1",
          description: "Initial description 1",
        },
        {
          ledgerId: testLedgerId,
          sourceDocumentId: testSourceDocId,
          amount: "200",
          itemName: "Item 2",
          description: "Initial description 2",
        },
      ])
      .returning();
    testEntryIds = entries.map((e) => e.id);
  });

  it("should batch update category and currency", async () => {
    // batchUpdateLedgerEntriesAction returns void in new format
    await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
      categoryId: testCategoryId,
      currency: "USD",
    });

    // Verify in DB
    const db = getTestDb();
    const updatedEntries = await db
      .select()
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.id, testEntryIds));

    expect(updatedEntries).toHaveLength(2);
    updatedEntries.forEach((entry) => {
      expect(entry.categoryId).toBe(testCategoryId);
      expect(entry.currency).toBe("USD");
    });
  });

  it("should batch update description", async () => {
    const newDescription = "Batch updated description";

    // batchUpdateLedgerEntriesAction returns void in new format
    await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
      description: newDescription,
    });

    // Verify in DB
    const db = getTestDb();
    const updatedEntries = await db
      .select()
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.id, testEntryIds));

    expect(updatedEntries).toHaveLength(2);
    updatedEntries.forEach((entry) => {
      expect(entry.description).toBe(newDescription);
    });
  });
});
