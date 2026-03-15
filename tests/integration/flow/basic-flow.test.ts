import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { flowEngine, FlowTaskHandler, FlowContext } from "@/lib/flow";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

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
        await context.updateProgress("processing");

        if (input.shouldFail) {
            throw new Error("Simulated Failure");
        }

        return { result: input.value * 2 };
    },

    async onComplete(_output, _input, _context: FlowContext) {
        // Root verification
    },
};

flowEngine.register(TEST_TASK_TYPE, testHandler);

describe("Flow System Integration", () => {
    let ledgerId: string;

    // Mock fetch for API calls if needed by tasks
    beforeEach(async () => {
        vi.stubGlobal('fetch', vi.fn());

        // Setup Ledger here because global setup truncates before each test
        const { ledgerId: id } = await createTestUserWithLedger(db, undefined, "Test Ledger");
        ledgerId = id;
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it("should execute a basic task successfully", async () => {
        const taskRunId = await flowEngine.submit(
            TEST_TASK_TYPE,
            { ledgerId, value: 21 },
            { title: "Test Task" }
        );

        expect(taskRunId).toBeDefined();

        // 2. Verify Initial State
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

        // 4. Verify input is stored
        expect(run?.input).toEqual({ ledgerId, value: 21 });

        // 5. Verify Stats (basic check)
        expect(run?.completedAt).toBeDefined();
    });

    it("should handle task failure", async () => {
        const taskRunId = await flowEngine.submit(
            TEST_TASK_TYPE,
            { ledgerId, value: 0, shouldFail: true },
            { title: "Failing Task" }
        );

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
