import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createFlowEngine } from "@/lib/flow/engine";
import type { FlowTaskHandler } from "@/lib/flow/types";
import { db } from "@/lib/db";
import { taskRuns } from "@/persistence";

async function waitForTask(taskId: string) {
  for (let i = 0; i < 100; i++) {
    const task = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, taskId) });
    if (task != null && ["completed", "failed", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Task ${taskId} did not reach a terminal state`);
}

const testHandler: FlowTaskHandler<{ value: number }, { result: number }> = {
  async execute(input, context) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (context.signal.aborted) {
      throw new Error("Task cancelled");
    }
    return { result: input.value * 2 };
  },
};

describe("Flow Engine Deduplication", () => {
  it("returns existing taskId when duplicate deduplicationKey is submitted", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("test-task", testHandler);

    const taskId1 = await engine.submit(
      "test-task",
      { value: 1 },
      { deduplicationKey: "dup-key-1" }
    );
    const taskId2 = await engine.submit(
      "test-task",
      { value: 2 },
      { deduplicationKey: "dup-key-1" }
    );

    expect(taskId1).toBe(taskId2);

    const tasks = await db.query.taskRuns.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.deduplicationKey).toBe("dup-key-1");
  });

  it("creates separate tasks for different deduplicationKeys", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("test-task", testHandler);

    const taskId1 = await engine.submit("test-task", { value: 1 }, { deduplicationKey: "key-1" });
    const taskId2 = await engine.submit("test-task", { value: 2 }, { deduplicationKey: "key-2" });

    expect(taskId1).not.toBe(taskId2);

    const tasks = await db.query.taskRuns.findMany();
    expect(tasks).toHaveLength(2);
  });

  it("allows duplicate submission after task completes", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("test-task", testHandler);

    const taskId1 = await engine.submit("test-task", { value: 1 }, { deduplicationKey: "key-3" });
    await waitForTask(taskId1);

    const taskId2 = await engine.submit("test-task", { value: 2 }, { deduplicationKey: "key-3" });

    expect(taskId1).not.toBe(taskId2);

    const tasks = await db.query.taskRuns.findMany();
    expect(tasks).toHaveLength(2);
  });
});
