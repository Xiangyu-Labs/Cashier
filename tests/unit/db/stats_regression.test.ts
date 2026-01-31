import { describe, it, expect } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgerEntries } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

/**
 * Regression Test for Statistics Data Issue
 * 
 * Issue: Confirmed ledger entries were missing from stats because they had null entryDate.
 * Fix: The API was updated to use COALESCE(entry_date, created_at) as the date source.
 * 
 * This test verifies that we can correctly filter and group ledger entries even if entryDate is null,
 * using the same SQL logic as the API.
 */
describe("Stats Regression Test", () => {
    it("should include ledger entries with null entryDate in date-filtered queries using createdAt fallback", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Stats Regression Ledger");
        const ledger = { id: ledgerId };

        // Create a ledger entry with NO entryDate (it defaults to null)
        // But it has a createdAt (defaults to now)
        const [tx] = await db
            .insert(ledgerEntries)
            .values({
                ledgerId: ledger.id,
                amount: "100.00",
                itemName: "No Date Entry",
                entryDate: null, // Explicitly null
            })
            .returning();

        expect(tx.entryDate).toBeNull();
        expect(tx.createdAt).toBeDefined();

        // Simulate the API query logic
        // We want to find this entry if we query for today's date range
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        // SQL logic mirrored from route.ts
        const dateCol = sql<string>`COALESCE(${ledgerEntries.entryDate}, ${ledgerEntries.createdAt}::date)`;

        // Construct query with the coalesced date filter
        const found = await db
            .select({
                id: ledgerEntries.id,
                date: dateCol
            })
            .from(ledgerEntries)
            .where(
                and(
                    eq(ledgerEntries.ledgerId, ledger.id),
                    sql`${dateCol} >= ${startDate.toISOString().split('T')[0]}::date`,
                    sql`${dateCol} <= ${endDate.toISOString().split('T')[0]}::date`
                )
            );

        expect(found).toHaveLength(1);
        expect(found[0].id).toBe(tx.id);
    });
});
