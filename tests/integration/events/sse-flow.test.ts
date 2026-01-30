import { describe, it, expect, beforeEach } from "vitest";
import { eventBus } from "@/lib/events/event-bus";
import { sourceDocumentRepo } from "@/lib/repositories";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns } from "@/lib/db/schema";
import { LedgerEvent } from "@/lib/events/types";
import { completeTaskRun, failTaskRun, recordTaskRunUsage } from "@/lib/flow/task-run-service";

describe("SSE Event Flow Integration", () => {
    let ledgerId: string;

    beforeEach(async () => {
        // Create a test ledger
        const [ledger] = await getTestDb().insert(ledgers).values({
            name: "Test Ledger",
            mainCurrency: "USD",
        }).returning();
        ledgerId = ledger.id;
    });

    it("should emit event when creating a source document via repository", async () => {
        const eventPromise = new Promise<LedgerEvent>((resolve) => {
            const unsubscribe = eventBus.subscribe(ledgerId, (event) => {
                if (event.type === 'entity:changed' && event.entity === 'source_document') {
                    resolve(event);
                    unsubscribe();
                }
            });
        });

        await sourceDocumentRepo.create({
            ledgerId,
            fileName: "test.pdf",
            status: "processing",
            fileSize: 1024,
            s3Key: "test/key",
            contentType: "application/pdf"
        });

        const event = await eventPromise;
        expect(event).toMatchObject({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: 'source_document',
            action: 'created'
        });
    });

    it("should emit event when completing task run via service", async () => {
        // Create a task run directly in DB first
        const [run] = await getTestDb().insert(taskRuns).values({
            ledgerId,
            type: 'test-task',
            title: 'Test Task',
            status: 'running',
        }).returning();

        const eventPromise = new Promise<LedgerEvent>((resolve) => {
            const unsubscribe = eventBus.subscribe(ledgerId, (event) => {
                if (event.type === 'entity:changed' && event.entity === 'task_run' && event.action === 'updated') {
                    resolve(event);
                    unsubscribe();
                }
            });
        });

        // Call service updating status
        await completeTaskRun(run.id, { result: 'ok' }, ledgerId);

        const event = await eventPromise;
        expect(event).toMatchObject({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: 'task_run',
            action: 'updated'
        });
    });

    it("should emit event when recording usage via service (CRITICAL FIX CHECK)", async () => {
        // This test verifies the fix for token updates not showing up
        const [run] = await getTestDb().insert(taskRuns).values({
            ledgerId,
            type: 'test-usage',
            title: 'Test Usage',
            status: 'running',
        }).returning();

        const eventPromise = new Promise<LedgerEvent>((resolve) => {
            const unsubscribe = eventBus.subscribe(ledgerId, (event) => {
                if (event.type === 'entity:changed' && event.entity === 'task_run' && event.action === 'updated') {
                    resolve(event);
                    unsubscribe();
                }
            });
        });

        // Call usage recording - MUST pass ledgerId for event to fire in the custom repo implementation
        await recordTaskRunUsage(run.id, { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, ledgerId);

        const event = await eventPromise;
        expect(event).toMatchObject({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: 'task_run',
            action: 'updated'
        });
    });

    it("should emit event when failing task run via service with ledgerId", async () => {
        // Create a task run directly in DB first
        const [run] = await getTestDb().insert(taskRuns).values({
            ledgerId,
            type: 'test-task-fail',
            title: 'Test Task Fail',
            status: 'running',
        }).returning();

        const eventPromise = new Promise<LedgerEvent>((resolve) => {
            const unsubscribe = eventBus.subscribe(ledgerId, (event) => {
                if (event.type === 'entity:changed' && event.entity === 'task_run' && event.action === 'updated') {
                    resolve(event);
                    unsubscribe();
                }
            });
        });

        // Call service updating status
        await failTaskRun(run.id, "error message", ledgerId);

        const event = await eventPromise;
        expect(event).toMatchObject({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: 'task_run',
            action: 'updated'
        });
    });
});
