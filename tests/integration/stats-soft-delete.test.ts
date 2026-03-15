import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../helpers/schema-setup";
import { ledgerEntries, sourceDocuments, ledgers } from "@/lib/db/schema";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { eq } from "drizzle-orm";

describe("Stats Soft Delete Filtering Regression", () => {
    let ledgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        // Cleanup existing ledger for TEST_USER_ID and create new one
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const setup = await createTestUserWithLedger(db, undefined, "Stats Ledger", TEST_USER_ID);
        ledgerId = setup.ledgerId;

        // Cleanup entries for this ledger
        await db.delete(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledgerId));
    });

    it("getLedgerStatsAction should filter out deleted entries", async () => {
        const db = getTestDb();

        // 1. Create source document with entryDate
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Test expense",
            entryDate: "2024-01-01",
            status: "completed",
        }).returning();

        // 2. Insert an active entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "100.00",
            currency: "CNY",
            itemName: "Active Item",
        });

        // 3. Insert a deleted entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "500.00",
            currency: "CNY",
            itemName: "Deleted Item",
            deletedAt: new Date(),
        });

        // 4. Call stat action
        const stats = await getLedgerStatsAction(ledgerId);

        // 5. Assert
        const cnyTotal = stats.totals.find(t => t.currency === "CNY");
        expect(cnyTotal?.total).toBe(100);
        expect(cnyTotal?.count).toBe(1);
    });

    it("getEnhancedStats should filter out deleted entries", async () => {
        const db = getTestDb();

        // 1. Create source document with entryDate
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Test expense",
            entryDate: "2024-02-01",
            status: "completed",
        }).returning();

        // 2. Insert an active entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "200.00",
            currency: "CNY",
            itemName: "Active Enhanced",
        });

        // 3. Insert a deleted entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            sourceDocumentId: sourceDoc.id,
            amount: "1000.00",
            currency: "CNY",
            itemName: "Deleted Enhanced",
            deletedAt: new Date(),
        });

        // 4. Call enhanced stats
        const stats = await getEnhancedStats({
            ledgerId,
            queryRange: { from: "2024-02-01", to: "2024-02-28" },
            compareRange: { from: "2024-01-01", to: "2024-01-31" }
        });

        // 5. Assert
        expect(stats.summary.total).toBe(200);
    });
});
