import { describe, expect, it, vi } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";

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
