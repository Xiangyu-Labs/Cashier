import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as tasksGET } from "@/app/api/processing-tasks/route";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

// Mock Processing - we might not need to mock if we use the DB directly for integration tests
// But the route uses getRecentProcessingTasks and getActiveProcessingTasks from @/lib/processing
// Let's check if we should mock those or verify DB interaction.
// Since it's integration, real DB interaction is better, but let's see if those functions are pure DB calls.
// Assuming they are, we'll insert into DB and check API response.

describe("Processing Tasks API", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Processing Task Test Ledger");
        testLedgerId = ledgerId;
    });

    it("should fetch empty tasks list initially", async () => {
        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${testLedgerId}`
        );
        const res = await tasksGET(req);

        expect(res.status).toBe(200);
        const tasks = await res.json();
        expect(tasks).toEqual([]);
    });

    it("should fetch recent tasks", async () => {
        const db = getTestDb();

        // Insert some sample tasks
        await db.insert(taskRuns).values([
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Task 1",
                status: "completed",
                output: { some: "data" },
                createdAt: new Date(Date.now() - 10000), // 10s ago
            },
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Task 2",
                status: "failed",
                error: "failed",
                createdAt: new Date(Date.now() - 5000), // 5s ago
            }
        ]);

        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${testLedgerId}`
        );
        const res = await tasksGET(req);

        expect(res.status).toBe(200);
        const tasks = await res.json();
        expect(tasks).toHaveLength(2);
        // Expect order? usually recent first
        // Need to check implementation of getRecentProcessingTasks, but assuming desc order
        // if not we can just check containment
        expect(tasks.map((t: { status: string }) => t.status)).toContain("completed");
        expect(tasks.map((t: { status: string }) => t.status)).toContain("failed");
    });

    it("should filter active tasks", async () => {
        const db = getTestDb();

        // Insert mixed tasks
        await db.insert(taskRuns).values([
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Active Task 1",
                status: "running", // active
            },
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Active Task 2",
                status: "running", // active (task_runs doesn't have 'queued' yet)
            },
            {
                ledgerId: testLedgerId,
                type: "parse_source_document",
                title: "Inactive Task",
                status: "completed", // inactive
            }
        ]);

        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${testLedgerId}&activeOnly=true`
        );
        const res = await tasksGET(req);

        expect(res.status).toBe(200);
        const tasks = await res.json();
        expect(tasks).toHaveLength(2);
        expect(tasks.every((t: { status: string }) => ["running", "active"].includes(t.status))).toBe(true);
    });

    it("should require ledgerId", async () => {
        const req = new NextRequest("http://localhost/api/processing-tasks");
        const res = await tasksGET(req);

        expect(res.status).toBe(400);
    });
});
