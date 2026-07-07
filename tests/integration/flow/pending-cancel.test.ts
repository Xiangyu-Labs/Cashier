import { describe, expect, it, vi } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";

async function waitForTerminalStatus(engine: ReturnType<typeof createFlowEngine>, taskId: string) {
  await expect
    .poll(async () => {
      const task = await engine.getStatus(taskId);
      return task?.status;
    })
    .toMatch(/^(completed|failed|cancelled)$/);
}

describe("Flow Engine pending cancellation", () => {
  it("releases the queue when a pending task is cancelled", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });

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

    const firstTaskId = await engine.submit("occupy", {});
    const cancelledId = await engine.submit("queued-cancel", {});
    const afterCancelTaskId = await engine.submit("after-cancel", {});

    await engine.cancel(cancelledId);
    releaseFirst();

    await vi.waitFor(() => {
      expect(executed).toEqual(["first", "cancel-hook", "third"]);
    });

    await expect(engine.getStatus(cancelledId)).resolves.toMatchObject({
      status: "cancelled",
    });
    await waitForTerminalStatus(engine, firstTaskId);
    await waitForTerminalStatus(engine, afterCancelTaskId);
  });
});
