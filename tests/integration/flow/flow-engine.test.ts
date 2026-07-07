import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createFlowEngine, type FlowContext } from "@/lib/flow";
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

describe("Cashier task engine", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("registers a handler and rejects duplicate registrations", () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    const handler = {
      async execute() {
        return { ok: true };
      },
    };

    engine.register("registration_task", handler);

    expect(() => engine.register("registration_task", handler)).toThrow(
      "Task handler already registered: registration_task"
    );
  });

  it("rejects unregistered tasks before creating a record", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });

    await expect(engine.submit("missing_task", { value: 1 })).rejects.toThrow(
      "No handler registered for task"
    );

    const tasks = await db.query.taskRuns.findMany();
    expect(tasks).toHaveLength(0);
  });

  it("persists submitted input, progress, completion, and token usage", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("behavior_task", {
      async execute(_input: { value: number }, context: FlowContext) {
        await context.updateProgress("halfway");
        context.reportTokens({ model: "test-model", input: 10, output: 5 });
        return { ok: true };
      },
    });

    const taskId = await engine.submit("behavior_task", { value: 2 }, { title: "Behavior Task" });
    const task = await waitForTask(taskId);

    expect(task.status).toBe("completed");
    expect(task.title).toBe("Behavior Task");
    expect(task.input).toEqual({ value: 2 });
    expect(task.progress).toBeNull();
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(task.tokenUsage).toMatchObject({
      "test-model": { input: 10, output: 5 },
      total: { input: 10, output: 5 },
    });
  });

  it("records task failures and calls onError", async () => {
    const onError = vi.fn();
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("failure_task", {
      async execute() {
        throw new Error("planned failure");
      },
      onError,
    });

    const taskId = await engine.submit("failure_task", { value: 1 });
    const task = await waitForTask(taskId);

    expect(task.status).toBe("failed");
    expect(task.error).toBe("planned failure");
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      { value: 1 },
      expect.objectContaining({ taskId })
    );
  });

  it("deduplicates pending and running tasks by key", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("dedupe_task", {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { ok: true };
      },
    });

    const firstTaskId = await engine.submit(
      "dedupe_task",
      { value: 1 },
      { deduplicationKey: "same-key" }
    );
    const secondTaskId = await engine.submit(
      "dedupe_task",
      { value: 2 },
      { deduplicationKey: "same-key" }
    );

    expect(secondTaskId).toBe(firstTaskId);
  });

  it("calls onCancel for a queued task", async () => {
    const onCancel = vi.fn();
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("occupy_slot", {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { ok: true };
      },
    });
    engine.register("queued_cancel_task", {
      async execute() {
        return { ok: true };
      },
      onCancel,
    });

    await engine.submit("occupy_slot", {});
    const queuedTaskId = await engine.submit("queued_cancel_task", { value: 3 });
    await engine.cancel(queuedTaskId);
    const task = await waitForTask(queuedTaskId);

    expect(task.status).toBe("cancelled");
    expect(onCancel).toHaveBeenCalledWith(
      { value: 3 },
      expect.objectContaining({ taskId: queuedTaskId, signal: expect.any(AbortSignal) })
    );
  });

  it("calls onComplete after successful execution", async () => {
    const onComplete = vi.fn();
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("complete_hook_task", {
      async execute() {
        return { result: 42 };
      },
      onComplete,
    });

    const taskId = await engine.submit("complete_hook_task", { value: 21 });
    const task = await waitForTask(taskId);

    expect(task.status).toBe("completed");
    expect(onComplete).toHaveBeenCalledWith(
      { result: 42 },
      { value: 21 },
      expect.objectContaining({ taskId })
    );
  });
});
