import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getTestDb } from "tests/setup";
import { ledgers, taskRuns } from "@/persistence";
import {
  batchDismissTasksUseCase,
  dismissTaskUseCase,
} from "@/modules/task-queue/application/use-cases/dismiss-task";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("dismiss-task use cases", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("soft-deletes a task in dismissTaskUseCase", async () => {
    const db = getTestDb();
    const taskId = uuidv4();

    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Dismiss me",
      status: "failed",
      scopeId: ledgerId,
    });

    await dismissTaskUseCase(ledgerId, taskId);

    const updated = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, taskId),
    });

    expect(updated?.deletedAt).not.toBeNull();
  });

  it("filters out tasks without matching ledger scope in batchDismissTasksUseCase", async () => {
    const db = getTestDb();
    const ownedTaskId = uuidv4();
    const nullScopeTaskId = uuidv4();

    await db.insert(taskRuns).values([
      {
        id: ownedTaskId,
        type: "parse_source_document",
        title: "Owned task",
        status: "failed",
        scopeId: ledgerId,
      },
      {
        id: nullScopeTaskId,
        type: "parse_source_document",
        title: "No scope task",
        status: "failed",
        scopeId: null,
      },
    ]);

    await batchDismissTasksUseCase(ledgerId, [ownedTaskId, nullScopeTaskId]);

    const owned = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, ownedTaskId),
    });
    const nullScope = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, nullScopeTaskId),
    });

    expect(owned?.deletedAt).not.toBeNull();
    expect(nullScope?.deletedAt).toBeNull();
  });

  it("returns immediately when batch list is empty", async () => {
    await expect(batchDismissTasksUseCase(ledgerId, [])).resolves.toBeUndefined();
  });
});
