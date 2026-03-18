import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns, users } from "@/persistence";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import {
  dismissTaskAction,
  batchDismissTasksAction,
} from "@/modules/task-queue/actions";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

describe("dismissTaskAction", () => {
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

  it("soft-deletes a task successfully", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "categorize_entry",
      title: "Test Task",
      status: "completed",
      scopeId: ledgerId,
    });

    await dismissTaskAction(ledgerId, taskId);

    const task = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, taskId),
    });
    expect(task?.deletedAt).not.toBeNull();
  });

  it("throws 'Task not found' when task does not exist", async () => {
    await expect(dismissTaskAction(ledgerId, uuidv4())).rejects.toThrow("Task not found");
  });

  it("throws 'Task does not belong to this ledger' for wrong ledger", async () => {
    const db = getTestDb();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const otherLedgerId = uuidv4();
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "categorize_entry",
      title: "Other Task",
      status: "completed",
      scopeId: otherLedgerId,
    });

    await expect(dismissTaskAction(ledgerId, taskId)).rejects.toThrow(
      "Task does not belong to this ledger"
    );
  });

  it("throws 'Ledger not found' when ledger belongs to another user", async () => {
    const db = getTestDb();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const otherLedgerId = uuidv4();
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    await expect(dismissTaskAction(otherLedgerId, uuidv4())).rejects.toThrow("Ledger not found");
  });
});

describe("batchDismissTasksAction", () => {
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

  it("returns immediately for empty taskIds", async () => {
    await expect(batchDismissTasksAction(ledgerId, [])).resolves.not.toThrow();
  });

  it("soft-deletes multiple tasks", async () => {
    const db = getTestDb();
    const id1 = uuidv4();
    const id2 = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: id1,
        type: "categorize_entry",
        title: "Task 1",
        status: "completed",
        scopeId: ledgerId,
      },
      {
        id: id2,
        type: "categorize_entry",
        title: "Task 2",
        status: "failed",
        scopeId: ledgerId,
      },
    ]);

    await batchDismissTasksAction(ledgerId, [id1, id2]);

    const task1 = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, id1) });
    const task2 = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, id2) });
    expect(task1?.deletedAt).not.toBeNull();
    expect(task2?.deletedAt).not.toBeNull();
  });

  it("silently filters out tasks from other ledgers", async () => {
    const db = getTestDb();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const otherLedgerId = uuidv4();
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    const ourTaskId = uuidv4();
    const otherTaskId = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: ourTaskId,
        type: "categorize_entry",
        title: "Our Task",
        status: "completed",
        scopeId: ledgerId,
      },
      {
        id: otherTaskId,
        type: "categorize_entry",
        title: "Other Task",
        status: "completed",
        scopeId: otherLedgerId,
      },
    ]);

    await batchDismissTasksAction(ledgerId, [ourTaskId, otherTaskId]);

    const ourTask = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, ourTaskId) });
    const otherTask = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, otherTaskId) });
    expect(ourTask?.deletedAt).not.toBeNull();
    expect(otherTask?.deletedAt).toBeNull(); // not touched
  });
});
