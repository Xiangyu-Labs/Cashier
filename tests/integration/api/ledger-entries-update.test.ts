
import { describe, it, expect, beforeEach } from "vitest";
import { updateLedgerEntryAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Ledger Entry Update Action", () => {
    let testLedgerId: string;
    let testEntryId: string;
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

        const [entry] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: testLedgerId,
                amount: "100.00",
                itemName: "Test Item",
                description: "Initial description",
                categoryId: testCategoryId,
            })
            .returning();
        testEntryId = entry.id;
    });

    it("should update description correctly", async () => {
        const newDescription = "Updated description";

        const result = await updateLedgerEntryAction(testLedgerId, testEntryId, { description: newDescription });

        expect(result.success).toBe(true);
        expect(result.data?.description).toBe(newDescription);

        // Verify in DB
        const db = getTestDb();
        const [updatedEntry] = await db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.id, testEntryId));

        expect(updatedEntry.description).toBe(newDescription);
    });

    it("should update other fields correctly", async () => {
        const changes = {
            amount: 200,
            itemName: "Updated Item",
            currency: "USD",
            entryDate: "2023-01-01T00:00:00.000Z",
        };

        const result = await updateLedgerEntryAction(testLedgerId, testEntryId, changes);

        expect(result.success).toBe(true);
        expect(result.data?.amount).toBe("200.00");
        expect(result.data?.itemName).toBe(changes.itemName);
        expect(result.data?.currency).toBe(changes.currency);
        expect(new Date(result.data!.entryDate!).toISOString()).toBe(changes.entryDate);
    });

    it("should handle partial updates", async () => {
        const result = await updateLedgerEntryAction(testLedgerId, testEntryId, { itemName: "Only Name Changed" });

        expect(result.success).toBe(true);
        expect(result.data?.itemName).toBe("Only Name Changed");
        expect(result.data?.amount).toBe("100.00"); // Original value
    });
});
