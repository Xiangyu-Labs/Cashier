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
        const result = await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
            categoryId: testCategoryId,
            currency: "USD"
        });

        expect(result.success).toBe(true);

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

        // Note: Action might expect Date object for date fields if typed tightly, 
        // OR it parses inside. The action says:
        /*
        if (validated.entryDate !== undefined) updateData.entryDate = validated.entryDate ? new Date(validated.entryDate) : null;
        But wait, `batchUpdateLedgerEntriesAction` takes `data: any` and does manual check.
        It does NOT seemingly confirm Zod schema or parse date string to Date object in the generic `updateData` construction?
        Let's check `actions/ledger-entries.ts` again.

        export async function batchUpdateLedgerEntriesAction(ledgerId: string, ledgerEntryIds: string[], data: any) {
             // ...
             if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
             // Add other fields as needed
             await scope.entries.batchUpdate(ledgerEntryIds, updateData);
        }
        
        The implementation I saw earlier was very minimal:
        // if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        // Add other fields as needed

        I might need to UPDATE `batchUpdateLedgerEntriesAction` to support more fields!
        */

        // I should check `src/actions/ledger-entries.ts` again to see if I need to expand it.
        // Assuming I need to expand it, I will do so.

        const result = await batchUpdateLedgerEntriesAction(testLedgerId, testEntryIds, {
            entryDate: newDate,
            description: newDescription
        });

        expect(result.success).toBe(true);

        // Verify in DB
        const db = getTestDb();
        const updatedEntries = await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.id, testEntryIds));

        expect(updatedEntries).toHaveLength(2);
        updatedEntries.forEach(entry => {
            expect(entry.description).toBe(newDescription);
            // entryDate might be Date object
            expect(entry.entryDate?.toISOString().split('T')[0]).toBe(newDate.split('T')[0]);
        });
    });
});
