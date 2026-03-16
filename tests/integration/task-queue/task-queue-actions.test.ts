import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns, users } from "@/lib/db/schema";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { v4 as uuidv4 } from "uuid";
import { getTaskQueueAction } from "@/features/task-queue/server/actions/task-queue";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

describe("getTaskQueueAction", () => {
    let ledgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        ledgerId = uuidv4();
        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("returns empty items and zero stats when no tasks exist", async () => {
        const result = await getTaskQueueAction(ledgerId);
        expect(result.items).toHaveLength(0);
        expect(result.stats).toEqual({
            pendingCount: 0,
            runningCount: 0,
            failedCount: 0,
            completedCount: 0,
            anomalyCount: 0,
            total: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            avgTokensPerTask: 0,
        });
    });

    it("includes pending, running, and failed tasks in items", async () => {
        const db = getTestDb();
        await db.insert(taskRuns).values([
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Pending Task",
                status: "pending",
                scopeId: ledgerId,
            },
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Running Task",
                status: "running",
                scopeId: ledgerId,
            },
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Failed Task",
                status: "failed",
                error: "Something went wrong",
                scopeId: ledgerId,
            },
        ]);

        const result = await getTaskQueueAction(ledgerId);
        expect(result.items).toHaveLength(3);
        expect(result.stats.pendingCount).toBe(1);
        expect(result.stats.runningCount).toBe(1);
        expect(result.stats.failedCount).toBe(1);
        expect(result.stats.total).toBe(3);
    });

    it("includes only latest 5 completed tasks in items", async () => {
        const db = getTestDb();
        const tasks = Array.from({ length: 7 }, (_, i) => ({
            id: uuidv4(),
            type: "parse_source_document",
            title: `Completed Task ${i}`,
            status: "completed" as const,
            scopeId: ledgerId,
            completedAt: new Date(Date.now() - i * 1000),
        }));
        await db.insert(taskRuns).values(tasks);

        const result = await getTaskQueueAction(ledgerId);
        const completedItems = result.items.filter(i => i.status === "completed");
        expect(completedItems).toHaveLength(5);
        expect(result.stats.completedCount).toBe(7); // total count, not just shown
    });

    it("includes anomaly source documents", async () => {
        const db = getTestDb();
        await db.insert(sourceDocuments).values([
            {
                id: uuidv4(),
                ledgerId,
                text: "anomaly doc 1",
                status: "anomaly",
                type: "ai_parsed",
                anomalyReason: "Could not parse",
                imageUrls: [],
            },
            {
                id: uuidv4(),
                ledgerId,
                text: "anomaly doc 2",
                status: "anomaly",
                type: "ai_parsed",
                anomalyReason: "Invalid format",
                imageUrls: [],
            },
        ]);

        const result = await getTaskQueueAction(ledgerId);
        expect(result.stats.anomalyCount).toBe(2);
        expect(result.stats.total).toBe(2);
        const anomalyItems = result.items.filter(i => i.kind === "anomaly");
        expect(anomalyItems).toHaveLength(2);
    });

    it("correctly accumulates token stats from completed tasks", async () => {
        const db = getTestDb();
        await db.insert(taskRuns).values([
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Task 1",
                status: "completed",
                scopeId: ledgerId,
                tokenUsage: { total: { input: 100, output: 50 } },
            },
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Task 2",
                status: "completed",
                scopeId: ledgerId,
                tokenUsage: { total: { input: 200, output: 100 } },
            },
        ]);

        const result = await getTaskQueueAction(ledgerId);
        expect(result.stats.totalInputTokens).toBe(300);
        expect(result.stats.totalOutputTokens).toBe(150);
        expect(result.stats.avgTokensPerTask).toBe(225); // (300+150)/2
    });

    it("avgTokensPerTask is 0 when no completed tasks (division by zero protection)", async () => {
        const db = getTestDb();
        await db.insert(taskRuns).values({
            id: uuidv4(),
            type: "parse_source_document",
            title: "Pending Task",
            status: "pending",
            scopeId: ledgerId,
        });

        const result = await getTaskQueueAction(ledgerId);
        expect(result.stats.avgTokensPerTask).toBe(0);
    });

    it("stats.total does not include completed tasks", async () => {
        const db = getTestDb();
        await db.insert(taskRuns).values([
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Pending",
                status: "pending",
                scopeId: ledgerId,
            },
            {
                id: uuidv4(),
                type: "parse_source_document",
                title: "Completed",
                status: "completed",
                scopeId: ledgerId,
            },
        ]);

        const result = await getTaskQueueAction(ledgerId);
        expect(result.stats.total).toBe(1); // only pending
        expect(result.stats.completedCount).toBe(1);
    });

    it("tenant isolation: only returns tasks for the current ledger", async () => {
        const db = getTestDb();

        // Create another user and ledger
        await db.insert(users).values({
            id: OTHER_USER_ID,
            email: "other@example.com",
            name: "Other User",
            emailVerified: new Date(),
        }).onConflictDoNothing();

        const otherLedgerId = uuidv4();
        await db.insert(ledgers).values({
            id: otherLedgerId,
            userId: OTHER_USER_ID,
            name: "Other Ledger",
            metadata: {},
        });

        // Task for other ledger
        await db.insert(taskRuns).values({
            id: uuidv4(),
            type: "parse_source_document",
            title: "Other Ledger Task",
            status: "pending",
            scopeId: otherLedgerId,
        });

        // Task for our ledger
        await db.insert(taskRuns).values({
            id: uuidv4(),
            type: "parse_source_document",
            title: "Our Task",
            status: "pending",
            scopeId: ledgerId,
        });

        const result = await getTaskQueueAction(ledgerId);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe("Our Task");
    });

    it("throws 'Unauthorized' when ledger belongs to another user", async () => {
        const db = getTestDb();

        await db.insert(users).values({
            id: OTHER_USER_ID,
            email: "other@example.com",
            name: "Other User",
            emailVerified: new Date(),
        }).onConflictDoNothing();

        const otherLedgerId = uuidv4();
        await db.insert(ledgers).values({
            id: otherLedgerId,
            userId: OTHER_USER_ID,
            metadata: {},
        });

        await expect(getTaskQueueAction(otherLedgerId)).rejects.toThrow("Ledger not found");
    });

    it("excludes completed tasks whose source document is in anomaly state from items", async () => {
        const db = getTestDb();
        const sourceDocId = uuidv4();

        // Create a source document in anomaly state
        await db.insert(sourceDocuments).values({
            id: sourceDocId,
            ledgerId,
            text: "anomaly doc",
            status: "anomaly",
            type: "ai_parsed",
            anomalyReason: "Could not parse",
            imageUrls: [],
        });

        // Create a completed task referencing this anomaly source document
        await db.insert(taskRuns).values({
            id: uuidv4(),
            type: "parse_source_document",
            title: "Parse Task",
            status: "completed",
            scopeId: ledgerId,
            input: { sourceDocumentId: sourceDocId, imageUrl: "test.jpg" },
        });

        const result = await getTaskQueueAction(ledgerId);

        // The anomaly document should appear in anomaly section
        expect(result.stats.anomalyCount).toBe(1);
        const anomalyItems = result.items.filter(i => i.kind === "anomaly");
        expect(anomalyItems).toHaveLength(1);
        expect(anomalyItems[0].sourceDocumentId).toBe(sourceDocId);

        // The completed task should NOT appear (because source doc is anomaly)
        const completedItems = result.items.filter(i => i.status === "completed");
        expect(completedItems).toHaveLength(0);

        // Total should only count the anomaly
        expect(result.stats.total).toBe(1);
    });

    it("includes completed tasks whose source document is in completed state", async () => {
        const db = getTestDb();
        const sourceDocId = uuidv4();

        // Create a source document in completed state
        await db.insert(sourceDocuments).values({
            id: sourceDocId,
            ledgerId,
            text: "completed doc",
            status: "completed",
            type: "ai_parsed",
            imageUrls: [],
        });

        // Create a completed task referencing this completed source document
        await db.insert(taskRuns).values({
            id: uuidv4(),
            type: "parse_source_document",
            title: "Parse Task",
            status: "completed",
            scopeId: ledgerId,
            input: { sourceDocumentId: sourceDocId, imageUrl: "test.jpg" },
        });

        const result = await getTaskQueueAction(ledgerId);

        // The completed task should appear
        const completedItems = result.items.filter(i => i.status === "completed");
        expect(completedItems).toHaveLength(1);

        // No anomaly items
        expect(result.stats.anomalyCount).toBe(0);
    });
});
