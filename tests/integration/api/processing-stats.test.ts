import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as tokenUsageGET } from "@/app/api/ledgers/[id]/processing-stats/token-usage/route";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";


describe("Processing Stats: Token Usage API", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Stats Test Ledger");
        testLedgerId = ledgerId;
    });

    it("should return zero stats when no tasks exist", async () => {
        const req = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/processing-stats/token-usage`
        );
        const res = await tokenUsageGET(req, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(res.status).toBe(200);
        const stats = await res.json();
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

        const { ledgerId: otherLedgerId } = await createTestUserWithLedger(db, "other@example.com", "Other Ledger");

        await db.insert(taskRuns).values([
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Task 1",
                status: "completed",
                usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
                createdAt: new Date(),
            },
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Task 2",
                status: "completed",
                usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
                createdAt: new Date(),
            },
            // This task should be ignored because it's not completed
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Task 3",
                status: "running",
                usage: { inputTokens: 500, outputTokens: 500, totalTokens: 1000 },
                createdAt: new Date(),
            },
            // This task should be ignored because it belongs to another ledger
            {
                ledgerId: otherLedgerId,
                type: "parse_source_document",
                title: "Other Ledger Task",
                status: "completed",
                usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
                createdAt: new Date(),
            }
        ]);

        const req = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/processing-stats/token-usage`
        );
        const res = await tokenUsageGET(req, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(res.status).toBe(200);
        const stats = await res.json();
        expect(stats).toEqual({
            totalInputTokens: 300,
            totalOutputTokens: 150,
            totalTokens: 450,
            taskCount: 2,
            averageTokensPerTask: 225,
        });
    });
});
