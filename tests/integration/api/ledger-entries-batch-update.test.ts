import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/ledgers/[id]/ledger-entries/batch-update/route";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("PATCH /api/ledgers/[id]/ledger-entries/batch-update", () => {
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
        const request = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/ledger-entries/batch-update`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    ledgerEntryIds: testEntryIds,
                    categoryId: testCategoryId,
                    currency: "USD"
                }),
            }
        );

        const response = await PATCH(request, {
            params: Promise.resolve({ id: testLedgerId })
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

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

        const request = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/ledger-entries/batch-update`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    ledgerEntryIds: testEntryIds,
                    entryDate: newDate,
                    description: newDescription
                }),
            }
        );

        const response = await PATCH(request, {
            params: Promise.resolve({ id: testLedgerId })
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify in DB
        const db = getTestDb();
        const updatedEntries = await db
            .select()
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.id, testEntryIds));

        expect(updatedEntries).toHaveLength(2);
        updatedEntries.forEach(entry => {
            expect(entry.description).toBe(newDescription);
            expect(entry.entryDate?.toISOString().split('T')[0]).toBe(newDate.split('T')[0]);
        });
    });
});
