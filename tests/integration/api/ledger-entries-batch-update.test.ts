import { describe, it, expect, beforeEach } from "vitest";
import { batchUpdateLedgerEntriesAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Batch Update Ledger Entries Action", () => {
    let testLedgerId: string;
    let testEntryIds: string[];
    let testCategoryId: string;

    beforeEach(async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        testLedgerId = ledgerId;

        const [category] = await db
            .insert(entryCategories)
            .values({ ledgerId: testLedgerId, name: "Dining", sortOrder: 1 })
            .returning();
        testCategoryId = category.id;

        const entries = await db
            .insert(ledgerEntries)
            .values([
                {
                    ledgerId: testLedgerId,
                    amount: "100",
                    itemName: "Item 1",
                    description: "Initial description 1",
                },
                {
                    ledgerId: testLedgerId,
                    amount: "200",
                    itemName: "Item 2",
                    description: "Initial description 2",
                }
            ])
            .returning();
        testEntryIds = entries.map(e => e.id);
    });

    it("should batch update category and currency", async () => {
        // batchUpdateLedgerEntriesAction returns void in new format
        await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
            categoryId: testCategoryId,
            currency: "USD"
        });

        // Verify in DB
        const db = getTestDb();
        const updatedEntries = await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.id, testEntryIds));

        expect(updatedEntries).toHaveLength(2);
        updatedEntries.forEach(entry => {
            expect(entry.categoryId).toBe(testCategoryId);
            expect(entry.currency).toBe("USD");
        });
    });

    it("should batch update entryDate and description", async () => {
        const newDate = "2023-10-27T00:00:00.000Z";
        const newDescription = "Batch updated description";

        // batchUpdateLedgerEntriesAction returns void in new format
        await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
            entryDate: newDate,
            description: newDescription
        });

        // Verify in DB
        const db = getTestDb();
        const updatedEntries = await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.id, testEntryIds));

        expect(updatedEntries).toHaveLength(2);
        updatedEntries.forEach(entry => {
            expect(entry.description).toBe(newDescription);
            // entryDate is now a string in yyyy-MM-dd format
            expect(entry.entryDate).toBe(newDate.split('T')[0]);
        });
    });
});
