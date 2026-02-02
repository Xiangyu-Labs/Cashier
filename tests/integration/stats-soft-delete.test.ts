import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { createTestUserWithLedger } from "../helpers/schema-setup";
import { ledgerEntries } from "@/lib/db/schema";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { eq } from "drizzle-orm";

describe("Stats Soft Delete Filtering Regression", () => {
    let ledgerId: string;
    let userId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const setup = await createTestUserWithLedger(db, "stats-test@example.com", "Stats Ledger");
        ledgerId = setup.ledgerId;
        userId = setup.userId;

        // Cleanup entries for this ledger
        await db.delete(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledgerId));
    });

    it("getLedgerStatsAction should filter out deleted entries", async () => {
        const db = getTestDb();

        // 1. Insert an active entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            amount: "100.00",
            currency: "CNY",
            itemName: "Active Item",
            entryDate: new Date("2024-01-01"),
        });

        // 2. Insert a deleted entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            amount: "500.00",
            currency: "CNY",
            itemName: "Deleted Item",
            entryDate: new Date("2024-01-01"),
            deletedAt: new Date(),
        });

        // 3. Call stat action
        const stats = await getLedgerStatsAction(ledgerId);

        // 4. Assert
        const cnyTotal = stats.totals.find(t => t.currency === "CNY");
        expect(cnyTotal?.total).toBe(100);
        expect(cnyTotal?.count).toBe(1);
    });

    it("getEnhancedStats should filter out deleted entries", async () => {
        const db = getTestDb();

        // 1. Insert an active entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            amount: "200.00",
            currency: "CNY",
            itemName: "Active Enhanced",
            entryDate: new Date("2024-02-01"),
        });

        // 2. Insert a deleted entry
        await db.insert(ledgerEntries).values({
            ledgerId,
            amount: "1000.00",
            currency: "CNY",
            itemName: "Deleted Enhanced",
            entryDate: new Date("2024-02-01"),
            deletedAt: new Date(),
        });

        // 3. Call enhanced stats
        const stats = await getEnhancedStats({
            ledgerId,
            queryRange: { from: "2024-02-01", to: "2024-02-28" },
            compareRange: { from: "2024-01-01", to: "2024-01-31" }
        });

        // 4. Assert
        expect(stats.summary.total).toBe(200);
    });
});
