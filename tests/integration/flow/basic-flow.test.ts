import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { registerFlowTask, FlowTaskHandler, FlowContext } from "@/lib/flow";
import { submitFlowTask } from "@/lib/flow/producer";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { processAllPendingTasks } from "../../helpers/processing";

// 1. Define Test Task
const TEST_TASK_TYPE = "integration_test_task";

interface TestInput {
    value: number;
    shouldFail?: boolean;
}

interface TestOutput {
    result: number;
}

const testHandler: FlowTaskHandler<TestInput, TestOutput> = {
    async execute(input, context) {
        await context.updateProgress({ currentStep: "processing", totalSteps: 1 });

        if (input.shouldFail) {
            throw new Error("Simulated Failure");
        }

        return { result: input.value * 2 };
    },

    async onComplete(_output, _input, _context: FlowContext) {
        // Root verification
    },
};

registerFlowTask(TEST_TASK_TYPE, testHandler);

describe("Flow System Integration", () => {
    let ledgerId: string;

    // Mock fetch for API calls if needed by tasks
    beforeEach(async () => {
        vi.stubGlobal('fetch', vi.fn());

        // Setup Ledger here because global setup truncates before each test
        const { ledgerId: id } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        ledgerId = id;
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it("should execute a basic task successfully", async () => {
        // 1. Submit Task
        // Note: submitFlowTask in the new architecture calls runTask asynchronously.
        // In a real environment this happens in background.
        // In test environment, we might experience race conditions if we check DB immediately?
        // Actually, submitFlowTask invokes runTask *without awaiting it*.
        // So for the test to be deterministic, we might need a small wait loop or helpers.

        const taskRunId = await submitFlowTask({
            type: TEST_TASK_TYPE,
            title: "Test Task",
            ledgerId: ledgerId,
            data: { value: 21 },
        });

        expect(taskRunId).toBeDefined();

        // 2. Verify Initial State
        // It might be running or completed depending on speed
        let run = await db.query.taskRuns.findFirst({
            where: eq(taskRuns.id, taskRunId)
        });
        expect(run).toBeDefined();

        // 3. Poll for Completion (Wait for in-process runner)
        for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 50)); // 50ms wait
            run = await db.query.taskRuns.findFirst({
                where: eq(taskRuns.id, taskRunId)
            });
            if (run?.status === 'completed' || run?.status === 'failed') break;
        }

        expect(run?.status).toBe('completed');

        // 4. Verify Output
        const output = run?.output as TestOutput;
        expect(output.result).toBe(42);

        // 5. Verify Stats (basic check)
        expect(run?.completedAt).toBeDefined();
    });

    it("should handle task failure", async () => {
        const taskRunId = await submitFlowTask({
            type: TEST_TASK_TYPE,
            title: "Failing Task",
            ledgerId: ledgerId,
            data: { value: 0, shouldFail: true },
        });

        // Wait for completion
        let run;
        for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 50));
            run = await db.query.taskRuns.findFirst({
                where: eq(taskRuns.id, taskRunId)
            });
            if (run?.status === 'completed' || run?.status === 'failed') break;
        }

        expect(run?.status).toBe('failed');
        expect(run?.error).toContain("Simulated Failure");
    });
});
