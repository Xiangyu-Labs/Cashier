import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";
import type { StorageAdapter, TaskInput, TaskRecord } from "@/lib/flow/types";

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
        result = result.filter((task) => task.type === filter.type);
      }
      if (filter?.status != null) {
        result = result.filter((task) => task.status === filter.status);
      }
      return result;
    },
  };
}

describe("Flow Engine pending cancellation", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("releases the queue when a pending task is cancelled", async () => {
    const engine = createFlowEngine({ storage, maxConcurrentTasks: 1 });

    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const executed: string[] = [];

    engine.register("occupy", {
      async execute() {
        executed.push("first");
        await firstDone;
        return { ok: true };
      },
    });

    engine.register("queued-cancel", {
      async execute() {
        executed.push("cancelled-task-should-not-run");
        return { ok: true };
      },
      async onCancel() {
        executed.push("cancel-hook");
      },
    });

    engine.register("after-cancel", {
      async execute() {
        executed.push("third");
        return { ok: true };
      },
    });

    await engine.submit("occupy", {});
    const cancelledId = await engine.submit("queued-cancel", {});
    await engine.submit("after-cancel", {});

    await engine.cancel(cancelledId);
    releaseFirst();

    await vi.waitFor(() => {
      expect(executed).toEqual(["first", "cancel-hook", "third"]);
    });

    await expect(engine.getStatus(cancelledId)).resolves.toMatchObject({
      status: "cancelled",
    });
  });
});
