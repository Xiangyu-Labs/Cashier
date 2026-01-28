
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/ledgers/[id]/ledger-entries/[ledgerEntryId]/route";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("PATCH /api/ledgers/[id]/ledger-entries/[ledgerEntryId]", () => {
    let testLedgerId: string;
    let testEntryId: string;
    let testCategoryId: string;

    beforeEach(async () => {
        const db = getTestDb();

        const [ledger] = await db
            .insert(ledgers)
            .values({ name: "Test Ledger" })
            .returning();
        testLedgerId = ledger.id;

        const [category] = await db
            .insert(entryCategories)
            .values({ ledgerId: testLedgerId, name: "Dining", sortOrder: 1 })
            .returning();
        testCategoryId = category.id;

        const [entry] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: testLedgerId,
                amount: "100",
                itemName: "Test Item",
                description: "Initial description",
                categoryId: testCategoryId,
            })
            .returning();
        testEntryId = entry.id;
    });

    it("should update description correctly", async () => {
        const newDescription = "Updated description";

        const request = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/ledger-entries/${testEntryId}`,
            {
                method: "PATCH",
                body: JSON.stringify({ description: newDescription }),
            }
        );

        const response = await PATCH(request, {
            params: Promise.resolve({ id: testLedgerId, ledgerEntryId: testEntryId })
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.description).toBe(newDescription);

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

        const request = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/ledger-entries/${testEntryId}`,
            {
                method: "PATCH",
                body: JSON.stringify(changes),
            }
        );

        const response = await PATCH(request, {
            params: Promise.resolve({ id: testLedgerId, ledgerEntryId: testEntryId })
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.amount).toBe("200.00");
        expect(data.itemName).toBe(changes.itemName);
        expect(data.currency).toBe(changes.currency);
        expect(new Date(data.entryDate).toISOString()).toBe(changes.entryDate);
    });

    it("should handle partial updates", async () => {
        const request = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/ledger-entries/${testEntryId}`,
            {
                method: "PATCH",
                body: JSON.stringify({ itemName: "Only Name Changed" }),
            }
        );

        const response = await PATCH(request, {
            params: Promise.resolve({ id: testLedgerId, ledgerEntryId: testEntryId })
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.itemName).toBe("Only Name Changed");
        expect(data.amount).toBe("100.00"); // Original value
    });
});
