import { describe, it, expect } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, transactions } from "@/lib/db/schema";

/**
 * Regression Test for Statistics Data Issue
 * 
 * Issue: Confirmed transactions were missing from stats because they had null transactionDate.
 * Fix: The API was updated to use COALESCE(transaction_date, created_at) as the date source.
 * 
 * This test verifies that we can correctly filter and group transactions even if transactionDate is null,
 * using the same SQL logic as the API.
 */
describe("Stats Regression Test", () => {
    it("should include transactions with null transactionDate in date-filtered queries using createdAt fallback", async () => {
        const db = getTestDb();
        const [ledger] = await db
            .insert(ledgers)
            .values({ name: "Stats Regression Ledger" })
            .returning();

        // Create a transaction with NO transactionDate (it defaults to null)
        // But it has a createdAt (defaults to now)
        const [tx] = await db
            .insert(transactions)
            .values({
                ledgerId: ledger.id,
                amount: "100.00",
                itemName: "No Date Transaction",
                transactionDate: null, // Explicitly null
            })
            .returning();

        expect(tx.transactionDate).toBeNull();
        expect(tx.createdAt).toBeDefined();

        // Simulate the API query logic
        // We want to find this transaction if we query for today's date range
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        // SQL logic mirrored from route.ts
        const dateCol = sql<string>`COALESCE(${transactions.transactionDate}, ${transactions.createdAt}::date)`;

        // Construct query with the coalesced date filter
        const found = await db
            .select({
                id: transactions.id,
                date: dateCol
            })
            .from(transactions)
            .where(
                and(
                    eq(transactions.ledgerId, ledger.id),
                    sql`${dateCol} >= ${startDate.toISOString().split('T')[0]}::date`,
                    sql`${dateCol} <= ${endDate.toISOString().split('T')[0]}::date`
                )
            );

        expect(found).toHaveLength(1);
        expect(found[0].id).toBe(tx.id);
    });
});
