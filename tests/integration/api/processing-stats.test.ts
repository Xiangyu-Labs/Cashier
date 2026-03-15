import { describe, it, expect, beforeEach } from "vitest";
import { getProcessingStatsAction } from "@/features/source-document/server/actions/processing";
import { getTestDb } from "../../setup";
import { taskRuns, ledgers } from "@/lib/db/schema";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { eq } from "drizzle-orm";

describe("Processing Stats Actions", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const { ledgerId } = await createTestUserWithLedger(db, undefined, "Stats Test Ledger", TEST_USER_ID);
        testLedgerId = ledgerId;
    });

    it("should return zero stats when no tasks exist", async () => {
        const stats = await getProcessingStatsAction(testLedgerId);

        expect(stats).toEqual({
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            taskCount: 0,
            averageTokensPerTask: 0,
        });
    });

    it("should aggregate token usage from completed tasks", async () => {
        const db = getTestDb();

        // Create another user and ledger with a DIFFERENT ID to test ledger isolation
        const otherUserId = "11111111-1111-1111-1111-111111111111";
        const { ledgerId: otherLedgerId } = await createTestUserWithLedger(db, "other@example.com", "Other Ledger", otherUserId);

        await db.insert(taskRuns).values([
            {
                input: { ledgerId: testLedgerId },
                scopeId: testLedgerId,
                type: "parse_source_document",
                title: "Task 1",
                status: "completed",
                tokenUsage: { total: { input: 100, output: 50 } },
                createdAt: new Date(),
            },
            {
                input: { ledgerId: testLedgerId },
                scopeId: testLedgerId,
                type: "parse_source_document",
                title: "Task 2",
                status: "completed",
                tokenUsage: { total: { input: 200, output: 100 } },
                createdAt: new Date(),
            },
            // This task should be ignored because it's not completed
            {
                input: { ledgerId: testLedgerId },
                scopeId: testLedgerId,
                type: "parse_source_document",
                title: "Task 3",
                status: "running",
                tokenUsage: { total: { input: 500, output: 500 } },
                createdAt: new Date(),
            },
            // This task should be ignored because it belongs to another ledger
            {
                input: { ledgerId: otherLedgerId },
                scopeId: otherLedgerId,
                type: "parse_source_document",
                title: "Other Ledger Task",
                status: "completed",
                tokenUsage: { total: { input: 1000, output: 1000 } },
                createdAt: new Date(),
            }
        ]);

        const stats = await getProcessingStatsAction(testLedgerId);

        expect(stats).toEqual({
            totalInputTokens: 300,
            totalOutputTokens: 150,
            totalTokens: 450,
            taskCount: 2,
            averageTokensPerTask: 225,
        });
    });
});
