import { describe, it, expect, beforeEach } from "vitest";
import { deleteLedgerEntryAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Ledger Entry Delete Action", () => {
    let testLedgerId: string;
    let testEntryId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        testLedgerId = ledgerId;

        const [entry] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: testLedgerId,
                amount: "100",
                itemName: "Delete Me",
            })
            .returning();
        testEntryId = entry.id;
    });

    it("should delete a ledger entry", async () => {
        const result = await deleteLedgerEntryAction(testLedgerId, testEntryId);
        expect(result.success).toBe(true);

        const db = getTestDb();
        const deletedEntry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, testEntryId),
        });
        expect(deletedEntry).toBeDefined();
        expect(deletedEntry?.deletedAt).not.toBeNull();
    });

    it("should fail if ledger entry belongs to another ledger", async () => {
        const db = getTestDb();
        const { ledgerId: otherLedgerId } = await createTestUserWithLedger(db, "other@example.com", "Other Ledger", "11111111-1111-1111-1111-111111111111");

        // This should fail because requireLedgerAccess will check if 'otherLedgerId' is owned by the current 'TEST_USER_ID' (0000...)
        // Wait, the action takes ledgerId as first arg. 
        // If I pass otherLedgerId, requireLedgerAccess(otherLedgerId) will fail for TEST_USER_ID.

        const result = await deleteLedgerEntryAction(otherLedgerId, testEntryId);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Unauthorized");
    });
});
