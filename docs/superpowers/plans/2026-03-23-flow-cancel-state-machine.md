# Flow Cancel State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure cancelling a queued flow task always releases its waiter, preserves exact-once cancellation behavior, and never blocks later tasks from starting.

**Architecture:** Keep `src/lib/flow/engine.ts` as the single owner of task lifecycle state. Represent queued work as cancellable waiters that resolve with a "slot granted" result, let `runTask()` finalize pending cancellations in one place, and lock the behavior down with integration tests that exercise the real queue ordering.

**Tech Stack:** TypeScript, Vitest integration tests, in-memory storage adapter

---

## File Map

- Modify: `src/lib/flow/engine.ts` - replace the current pending queue record shape with a cancellable waiter flow that cannot leave `runTask()` suspended forever.
- Modify: `tests/integration/flow/on-cancel.test.ts` - keep existing pending/running cancel coverage aligned with the new control flow.
- Create: `tests/integration/flow/pending-cancel.test.ts` - reproduce the deadlock where a cancelled queued task blocks the next task forever.

### Task 1: Release queued waiters on cancel

**Files:**
- Modify: `src/lib/flow/engine.ts`
- Modify: `tests/integration/flow/on-cancel.test.ts`
- Create: `tests/integration/flow/pending-cancel.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";

it("releases the queue when a pending task is cancelled", async () => {
  const storage = createMemoryStorage();
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration -- tests/integration/flow/pending-cancel.test.ts`

Expected: FAIL by timeout or unmet expectation because the queued cancellation never wakes the waiting `runTask()` promise, so `"third"` never executes.

- [ ] **Step 3: Write the minimal engine fix**

```ts
type PendingWaiter = {
  taskId: string;
  resolve: (granted: boolean) => void;
};

const pendingQueue: PendingWaiter[] = [];

async function acquireSlot(taskId: string): Promise<boolean> {
  if (maxConcurrent <= 0 || runningCount < maxConcurrent) {
    runningCount++;
    return true;
  }

  return new Promise((resolve) => {
    pendingQueue.push({ taskId, resolve });
  });
}

function releaseSlot(): void {
  const next = pendingQueue.shift();
  if (next) {
    next.resolve(true);
    return;
  }
  runningCount--;
}

function wakeCancelledWaiter(taskId: string): boolean {
  const index = pendingQueue.findIndex((item) => item.taskId === taskId);
  if (index === -1) return false;

  const [waiter] = pendingQueue.splice(index, 1);
  waiter?.resolve(false);
  return true;
}

async function runTask<TInput>(...) {
  const slotGranted = await acquireSlot(taskId);

  if (!slotGranted) {
    const handler = handlers.get(name);
    if (handler?.onCancel) {
      await handler.onCancel(input, {
        taskId,
        signal,
        reportTokens: () => {},
        updateProgress: async () => {},
        ai: buildAIContext(signal, () => {}),
      });
    }

    await config.storage.update(taskId, { status: "cancelled", progress: null });
    abortControllers.delete(taskId);
    return;
  }

  // Existing running-task logic stays here.
}

async cancel(taskId: string): Promise<void> {
  const controller = abortControllers.get(taskId);

  if (wakeCancelledWaiter(taskId)) {
    controller?.abort();
    logger.info({ taskId }, "Task cancellation requested while pending");
    return;
  }

  controller?.abort();
}
```

Implementation notes:

- Do not call `releaseSlot()` in the `!slotGranted` branch, because the task never owned a slot.
- Do not update task status from the pending branch of `cancel()`. Let `runTask()` own final state writes so `onCancel` and status changes stay exact-once.
- Keep the existing running-task cancellation path unchanged apart from the new helper usage.

- [ ] **Step 4: Run the targeted flow tests**

Run: `npm run test:integration -- tests/integration/flow/pending-cancel.test.ts tests/integration/flow/on-cancel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow/engine.ts tests/integration/flow/pending-cancel.test.ts tests/integration/flow/on-cancel.test.ts
git commit -m "fix: release queued flow tasks on cancel"
```
