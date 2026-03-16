import { describe, it, expect, beforeEach } from "vitest";
import { deleteLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { getTestDb } from "../../setup";
import { ledgerEntries, ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, createTestSourceDocument, TEST_USER_ID } from "../../helpers/schema-setup";

describe("Ledger Entry Delete Action", () => {
    let testLedgerId: string;
    let testEntryId: string;
    let testSourceDocId: string;

    beforeEach(async () => {
        const db = getTestDb();
        // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
        testLedgerId = ledgerId;

        // Create a test source document for entries
        testSourceDocId = await createTestSourceDocument(db, testLedgerId);

        const [entry] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: testLedgerId,
                sourceDocumentId: testSourceDocId,
                amount: "100",
                itemName: "Delete Me",
            })
            .returning();
        testEntryId = entry.id;
    });

    it("should delete a ledger entry", async () => {
        // deleteLedgerEntryAction returns void in new format
        await deleteLedgerEntryAction(testLedgerId, testEntryId);

        const db = getTestDb();
        const deletedEntry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, testEntryId),
        });
        expect(deletedEntry).toBeDefined();
        expect(deletedEntry?.deletedAt).not.toBeNull();
    });

    it("should throw error if ledger entry belongs to another ledger", async () => {
        const db = getTestDb();
        const { ledgerId: otherLedgerId } = await createTestUserWithLedger(db, "other@example.com", "Other Ledger", "11111111-1111-1111-1111-111111111111");

        // This should throw error because requireLedgerAccess will fail for TEST_USER_ID
        await expect(deleteLedgerEntryAction(otherLedgerId, testEntryId))
            .rejects.toThrow("Ledger not found");
    });
});

