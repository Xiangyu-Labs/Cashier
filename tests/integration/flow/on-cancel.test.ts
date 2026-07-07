import { describe, it, expect, beforeEach } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";
import type { FlowTaskHandler } from "@/lib/flow/types";

async function waitForTerminalStatus(engine: ReturnType<typeof createFlowEngine>, taskId: string) {
  await expect
    .poll(async () => {
      const task = await engine.getStatus(taskId);
      return task?.status;
    })
    .toMatch(/^(completed|failed|cancelled)$/);
}

describe("Flow Engine onCancel Hook", () => {
  let onCancelCalled: boolean;
  let onCancelInput: unknown;
  let onCancelSignalAborted: boolean | null;

  beforeEach(() => {
    onCancelCalled = false;
    onCancelInput = null;
    onCancelSignalAborted = null;
  });

  it("calls onCancel when task is cancelled while pending", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    const longRunningHandler: FlowTaskHandler<unknown, unknown> = {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { done: true };
      },
    };
    engine.register("long-occupier", longRunningHandler);
    const longTaskId = await engine.submit("long-occupier", {});

    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 };
      },
      async onCancel(input, context) {
        onCancelCalled = true;
        onCancelInput = input;
        onCancelSignalAborted = context.signal.aborted;
      },
    };

    engine.register("cancel-test", handler);

    const taskId = await engine.submit("cancel-test", { value: 1 });
    await engine.cancel(taskId);

    await expect.poll(() => onCancelCalled).toBe(true);

    expect(onCancelInput).toEqual({ value: 1 });
    expect(onCancelSignalAborted).toBe(true);
    await expect(engine.getStatus(taskId)).resolves.toMatchObject({ status: "cancelled" });
    await waitForTerminalStatus(engine, longTaskId);
  });

  it("calls onCancel when task is cancelled while running", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input, context) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (context.signal.aborted) {
          throw new Error("Task cancelled");
        }
        return { result: input.value * 2 };
      },
      async onCancel(input, context) {
        onCancelCalled = true;
        onCancelInput = input;
        onCancelSignalAborted = context.signal.aborted;
      },
    };

    engine.register("cancel-running-test", handler);

    const taskId = await engine.submit("cancel-running-test", { value: 1 });
    await expect.poll(async () => (await engine.getStatus(taskId))?.status).toBe("running");

    await engine.cancel(taskId);

    await expect.poll(() => onCancelCalled).toBe(true);
    expect(onCancelInput).toEqual({ value: 1 });
    expect(onCancelSignalAborted).toBe(true);
    await waitForTerminalStatus(engine, taskId);
  });

  it("does not break if onCancel is not defined", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 };
      },
    };

    engine.register("no-cancel-handler", handler);

    const taskId = await engine.submit("no-cancel-handler", { value: 1 });

    await expect(engine.cancel(taskId)).resolves.not.toThrow();
    await waitForTerminalStatus(engine, taskId);
  });
});
