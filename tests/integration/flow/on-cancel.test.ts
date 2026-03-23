import { describe, it, expect, beforeEach } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";
import type { StorageAdapter, TaskRecord, TaskInput, FlowTaskHandler } from "@/lib/flow/types";

function createMemoryStorage(): StorageAdapter & { tasks: Map<string, TaskRecord>; clear(): void } {
  const tasks = new Map<string, TaskRecord>();
  let idCounter = 1;

  return {
    tasks,
    clear() {
      tasks.clear();
      idCounter = 1;
    },
    async create(task: TaskInput): Promise<string> {
      const id = `task-${idCounter++}`;
      const now = new Date();
      tasks.set(id, {
        id,
        type: task.type,
        title: task.title ?? null,
        status: "pending",
        progress: null,
        input: task.input,
        deduplicationKey: task.deduplicationKey ?? null,
        error: null,
        tokenUsage: null,
        scopeId: task.scopeId ?? null,
        entityType: task.entityType ?? null,
        entityId: task.entityId ?? null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      });
      return id;
    },
    async update(id: string, data: Partial<TaskRecord>): Promise<void> {
      const task = tasks.get(id);
      if (task) {
        Object.assign(task, data);
        task.updatedAt = new Date();
      }
    },
    async get(id: string): Promise<TaskRecord | null> {
      return tasks.get(id) ?? null;
    },
    async list(filter?: { type?: string; status?: string }): Promise<TaskRecord[]> {
      let result = Array.from(tasks.values());
      if (filter?.type != null) {
        result = result.filter((t) => t.type === filter.type);
      }
      if (filter?.status != null) {
        result = result.filter((t) => t.status === filter.status);
      }
      return result;
    },
  };
}

describe("Flow Engine onCancel Hook", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let engine: ReturnType<typeof createFlowEngine>;
  let onCancelCalled: boolean;
  let onCancelInput: unknown;

  beforeEach(() => {
    storage = createMemoryStorage();
    engine = createFlowEngine({ storage, maxConcurrentTasks: 1 });
    onCancelCalled = false;
    onCancelInput = null;
  });

  it("should call onCancel when task is cancelled while pending", async () => {
    // First, occupy the only slot with a long-running task
    const longRunningHandler: FlowTaskHandler<unknown, unknown> = {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { done: true };
      },
    };
    engine.register("long-occupier", longRunningHandler);
    await engine.submit("long-occupier", {});

    // Now our test task will be queued (pending)
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 };
      },
      async onCancel(input) {
        onCancelCalled = true;
        onCancelInput = input;
      },
    };

    engine.register("cancel-test", handler);

    const taskId = await engine.submit("cancel-test", { value: 1 });

    // Cancel immediately while still pending in queue
    await engine.cancel(taskId);

    // Wait a bit for async cancellation
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onCancelCalled).toBe(true);
    expect(onCancelInput).toEqual({ value: 1 });
  });

  it("should call onCancel when task is cancelled while running", async () => {
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input, context) {
        // Simulate long-running task
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (context.signal.aborted) {
          throw new Error("Task cancelled");
        }
        return { result: input.value * 2 };
      },
      async onCancel(input) {
        onCancelCalled = true;
        onCancelInput = input;
      },
    };

    engine.register("cancel-running-test", handler);

    const taskId = await engine.submit("cancel-running-test", { value: 1 });

    // Wait for task to start running
    await new Promise((resolve) => setTimeout(resolve, 10));

    await engine.cancel(taskId);

    // Wait for cancellation to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onCancelCalled).toBe(true);
  });

  it("should not break if onCancel is not defined", async () => {
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 };
      },
      // No onCancel defined
    };

    engine.register("no-cancel-handler", handler);

    const taskId = await engine.submit("no-cancel-handler", { value: 1 });

    // Should not throw
    await expect(engine.cancel(taskId)).resolves.not.toThrow();
  });
});
