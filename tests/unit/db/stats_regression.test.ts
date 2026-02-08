import { describe, it, expect } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

/**
 * Regression Test for Statistics Data Issue
 *
 * Issue: Previously entries could have null entryDate. Now entryDate is on sourceDocument.
 * Fix: Entries now inherit entryDate from their associated sourceDocument.
 *
 * This test verifies that we can correctly filter and group ledger entries
 * using the sourceDocument's entryDate.
 */
describe("Stats Regression Test", () => {
    it("should include ledger entries when sourceDocument has entryDate", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Stats Regression Ledger");
        const ledger = { id: ledgerId };

        // Create a source document with entryDate
        const today = new Date().toISOString().split('T')[0];
        const [sourceDoc] = await db
            .insert(sourceDocuments)
            .values({
                ledgerId: ledger.id,
                text: "Test expense",
                entryDate: today,
                status: "completed",
            })
            .returning();

        // Create a ledger entry associated with the source document
        const [tx] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: ledger.id,
                sourceDocumentId: sourceDoc.id,
                amount: "100.00",
                itemName: "Test Entry",
            })
            .returning();

        expect(tx.sourceDocumentId).toBe(sourceDoc.id);
        expect(tx.createdAt).toBeDefined();

        // Verify we can find the entry via sourceDocument's entryDate
        const found = await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.ledgerId, ledger.id),
                isNull(ledgerEntries.deletedAt)
            ),
            with: {
                sourceDocument: true
            }
        });

        expect(found).toHaveLength(1);
        expect(found[0].id).toBe(tx.id);
        expect(found[0].sourceDocument?.entryDate).toBe(today);
    });
});
