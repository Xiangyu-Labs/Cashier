import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { registerFlowTask, FlowTaskHandler, FlowDefinition, FlowContext } from "@/lib/flow";
import { submitFlowTask } from "@/lib/flow/producer";
import { mainWorker, apiWorker } from "@/lib/flow/workers";
import { db } from "@/lib/db";
import { taskRuns, ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createLedgerData } from "../../helpers/factories";
import { mainQueue, apiQueue } from "@/lib/flow/queues";

// 1. Define Recursive Test Task
const RECURSIVE_TASK_TYPE = "integration_recursive_task";

interface RecursiveInput {
    value: number;
    depth: number; // 0 means leaf
}

interface RecursiveOutput {
    sum: number;
    isLeaf: boolean;
}

const recursiveHandler: FlowTaskHandler<RecursiveInput, RecursiveOutput> = {
    async execute(input, _context): Promise<RecursiveOutput | FlowDefinition> {
        if (input.depth <= 0) {
            // Leaf: return value
            return { sum: input.value, isLeaf: true };
        }

        // Parent: Split into 2 children
        // e.g. input 10 -> child1(5), child2(5)
        const childValue = Math.floor(input.value / 2);

        return {
            name: RECURSIVE_TASK_TYPE,
            title: `Recursive Step Depth ${input.depth}`,
            queueName: 'main',
            data: {}, // ignored in definition return
            children: [
                {
                    name: RECURSIVE_TASK_TYPE,
                    title: `Child 1 (Depth ${input.depth - 1})`,
                    queueName: 'main',
                    data: { value: childValue, depth: input.depth - 1 }
                },
                {
                    name: RECURSIVE_TASK_TYPE,
                    title: `Child 2 (Depth ${input.depth - 1})`,
                    queueName: 'main',
                    data: { value: input.value - childValue, depth: input.depth - 1 }
                }
            ]
        };
    },

    async onChildrenCompleted(results: unknown[], _context: FlowContext): Promise<RecursiveOutput> {
        // Aggregate results
        const totalSum = (results as RecursiveOutput[]).reduce((acc: number, r: RecursiveOutput) => acc + r.sum, 0);
        return { sum: totalSum, isLeaf: false };
    },

    async onComplete(_output, _input, _context) {
        // Root verification
    }
};

registerFlowTask(RECURSIVE_TASK_TYPE, recursiveHandler);

describe("Recursive Flow Integration", () => {
    let ledgerId: string;

    beforeAll(async () => {
        // Ensure workers are ready
        await mainWorker.waitUntilReady();
        await apiWorker.waitUntilReady();
    });

    beforeEach(async () => {
        // Setup Ledger here because global setup truncates before each test
        const ledgerData = createLedgerData();
        const [ledger] = await db.insert(ledgers).values(ledgerData).returning();
        ledgerId = ledger.id;
    });

    afterAll(async () => {
        // We don't close workers here because other tests might need them if running in parallel suite
        // But for this file in isolation it's fine. 
        // Best practice in this codebase seems to be closing in afterAll if opened/imported specifically
        await mainWorker.close();
        await apiWorker.close();
        await mainQueue.close();
        await apiQueue.close();
    });

    it("should execute a recursive fan-out/fan-in flow successfully", async () => {
        // 1. Submit Task: Depth 2 (Root -> 2 Children (Depth 1) -> 4 Grandchildren (Depth 0))
        // Root Value: 100
        // L1: 50, 50
        // L0: 25, 25, 25, 25
        // Sum should be 100

        const taskRunId = await submitFlowTask({
            type: RECURSIVE_TASK_TYPE,
            title: "Recursive Root",
            ledgerId: ledgerId,
            data: { value: 100, depth: 2 },
            queueName: 'main'
        });

        expect(taskRunId).toBeDefined();

        const immediateCheck = await db.query.taskRuns.findFirst({
            where: eq(taskRuns.id, taskRunId)
        });
        console.log("Immediate DB Check:", immediateCheck);

        // 2. Poll for Completion
        // Recursive tasks take longer due to multiple queue roundtrips
        // Max wait 10s
        let run;
        for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 100));
            run = await db.query.taskRuns.findFirst({
                where: eq(taskRuns.id, taskRunId)
            });
            if (run?.status === 'completed' || run?.status === 'failed') break;
        }

        expect(run?.status).toBe('completed');

        // 3. Verify Output
        // The output is stored in DB as jsonb
        const output = run?.output as RecursiveOutput;
        expect(output.sum).toBe(100);
        expect(output.isLeaf).toBe(false);
    }, 15000); // Increased timeout for recursion
});
