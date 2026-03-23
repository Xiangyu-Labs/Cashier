import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, taskRuns, users } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

const { cancelMock } = vi.hoisted(() => ({
  cancelMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/flow", () => ({
  cancelFlowTask: cancelMock,
}));

import { cancelFlowTask } from "@/lib/flow";
import { cancelTaskAction, batchCancelTasksAction } from "@/modules/task-queue/actions";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

function normalizeSql(sqlStatement: string): string {
  return sqlStatement.toLowerCase().replace(/\s+/g, " ").trim();
}

async function captureSqlStatements<T>(
  fn: () => Promise<T>
): Promise<{ result: T; statements: string[] }> {
  const dbWithClient = getTestDb() as unknown as {
    $client?: { prepare: (sql: string, ...args: unknown[]) => unknown };
  };
  const client = dbWithClient.$client;
  if (client == null) {
    throw new Error("Expected drizzle client to exist in integration tests");
  }

  const originalPrepare = client.prepare.bind(client);
  const statements: string[] = [];

  client.prepare = ((sqlStatement: string, ...args: unknown[]) => {
    statements.push(sqlStatement);
    return originalPrepare(sqlStatement, ...args);
  }) as typeof client.prepare;

  try {
    const result = await fn();
    return { result, statements };
  } finally {
    client.prepare = originalPrepare;
  }
}

describe("cancelTaskAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("cancels a running task and calls cancelFlowTask", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Running Task",
      status: "running",
      scopeId: ledgerId,
    });

    await cancelTaskAction(ledgerId, taskId);
    expect(cancelFlowTask).toHaveBeenCalledWith(taskId);
  });

  it("cancels a pending task and calls cancelFlowTask", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Pending Task",
      status: "pending",
      scopeId: ledgerId,
    });

    await cancelTaskAction(ledgerId, taskId);
    expect(cancelFlowTask).toHaveBeenCalledWith(taskId);
  });

  it("throws 'Task not found' when task does not exist", async () => {
    await expect(cancelTaskAction(ledgerId, uuidv4())).rejects.toThrow("Task not found");
  });

  it("treats a soft-deleted task as not found", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Deleted Task",
      status: "running",
      scopeId: ledgerId,
      deletedAt: new Date("2024-03-01T00:00:00.000Z"),
    });

    await expect(cancelTaskAction(ledgerId, taskId)).rejects.toThrow("Task not found");
    expect(cancelFlowTask).not.toHaveBeenCalled();
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
      type: "parse_source_document",
      title: "Other Task",
      status: "running",
      scopeId: otherLedgerId,
    });

    await expect(cancelTaskAction(ledgerId, taskId)).rejects.toThrow(
      "Task does not belong to this ledger"
    );
  });

  it("throws 'Cannot cancel task with status' for completed task", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Completed Task",
      status: "completed",
      scopeId: ledgerId,
    });

    await expect(cancelTaskAction(ledgerId, taskId)).rejects.toThrow(
      "Cannot cancel task with status 'completed'"
    );
  });

  it("throws 'Cannot cancel task with status' for failed task", async () => {
    const db = getTestDb();
    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Failed Task",
      status: "failed",
      scopeId: ledgerId,
    });

    await expect(cancelTaskAction(ledgerId, taskId)).rejects.toThrow(
      "Cannot cancel task with status 'failed'"
    );
  });

  it("soft-deletes processing source doc when entityType=source_document", async () => {
    const db = getTestDb();

    const createdDocs = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "processing",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();
    const doc = requireFirst(createdDocs, "source document");

    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Parse Task",
      status: "running",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: doc.id,
    });

    await cancelTaskAction(ledgerId, taskId);

    const updated = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    expect(updated?.status).toBe("deleted");
    expect(updated?.deletedAt).not.toBeNull();
  });

  it("soft-deletes queued source doc when entityType=source_document", async () => {
    const db = getTestDb();

    const createdDocs = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "queued",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();
    const doc = requireFirst(createdDocs, "source document");

    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Parse Task",
      status: "pending",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: doc.id,
    });

    await cancelTaskAction(ledgerId, taskId);

    const updated = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    expect(updated?.status).toBe("deleted");
    expect(updated?.deletedAt).not.toBeNull();
  });

  it("does not soft-delete completed source doc on cancel", async () => {
    const db = getTestDb();

    const createdDocs = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();
    const doc = requireFirst(createdDocs, "source document");

    const taskId = uuidv4();
    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Parse Task",
      status: "running",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: doc.id,
    });

    await cancelTaskAction(ledgerId, taskId);

    const updated = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.deletedAt).toBeNull();
  });
});

describe("batchCancelTasksAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("returns immediately for empty taskIds", async () => {
    await batchCancelTasksAction(ledgerId, []);
    expect(cancelFlowTask).not.toHaveBeenCalled();
  });

  it("cancels multiple valid tasks", async () => {
    const db = getTestDb();
    const id1 = uuidv4();
    const id2 = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: id1,
        type: "parse_source_document",
        title: "Task 1",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        id: id2,
        type: "parse_source_document",
        title: "Task 2",
        status: "running",
        scopeId: ledgerId,
      },
    ]);

    await batchCancelTasksAction(ledgerId, [id1, id2]);
    expect(cancelFlowTask).toHaveBeenCalledTimes(2);
  });

  it("filters out tasks from other ledgers silently", async () => {
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
        type: "parse_source_document",
        title: "Our Task",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        id: otherTaskId,
        type: "parse_source_document",
        title: "Other Task",
        status: "pending",
        scopeId: otherLedgerId,
      },
    ]);

    await batchCancelTasksAction(ledgerId, [ourTaskId, otherTaskId]);
    expect(cancelFlowTask).toHaveBeenCalledTimes(1);
    expect(cancelFlowTask).toHaveBeenCalledWith(ourTaskId);
  });

  it("filters out non-cancellable tasks (completed/failed) silently", async () => {
    const db = getTestDb();
    const pendingId = uuidv4();
    const completedId = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: pendingId,
        type: "parse_source_document",
        title: "Pending",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        id: completedId,
        type: "parse_source_document",
        title: "Completed",
        status: "completed",
        scopeId: ledgerId,
      },
    ]);

    await batchCancelTasksAction(ledgerId, [pendingId, completedId]);
    expect(cancelFlowTask).toHaveBeenCalledTimes(1);
    expect(cancelFlowTask).toHaveBeenCalledWith(pendingId);
  });

  it("pushes ledger/status/deleted filtering into SQL in batch lookup", async () => {
    const db = getTestDb();
    const pendingId = uuidv4();
    const runningId = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: pendingId,
        type: "parse_source_document",
        title: "Pending",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        id: runningId,
        type: "parse_source_document",
        title: "Running",
        status: "running",
        scopeId: ledgerId,
      },
    ]);

    const { statements } = await captureSqlStatements(() =>
      batchCancelTasksAction(ledgerId, [pendingId, runningId])
    );
    const taskRunsSelect = statements
      .map(normalizeSql)
      .find((sqlStatement) => sqlStatement.startsWith("select") && sqlStatement.includes('from "task_runs"'));

    expect(taskRunsSelect).toBeDefined();
    expect(taskRunsSelect).toContain('"scope_id" = ?');
    expect(taskRunsSelect).toContain('"deleted_at" is null');
    expect(taskRunsSelect).toContain('"status" in (?, ?)');
  });

  it("soft-deletes processing source docs for batch cancel", async () => {
    const db = getTestDb();

    const createdDoc1Rows = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "doc1",
        status: "processing",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();
    const doc1 = requireFirst(createdDoc1Rows, "source document");

    const createdDoc2Rows = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "doc2",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();
    const doc2 = requireFirst(createdDoc2Rows, "source document");

    const taskId1 = uuidv4();
    const taskId2 = uuidv4();
    await db.insert(taskRuns).values([
      {
        id: taskId1,
        type: "parse_source_document",
        title: "Task 1",
        status: "running",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: doc1.id,
      },
      {
        id: taskId2,
        type: "parse_source_document",
        title: "Task 2",
        status: "running",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: doc2.id,
      },
    ]);

    await batchCancelTasksAction(ledgerId, [taskId1, taskId2]);

    const updatedDoc1 = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc1.id),
    });
    const updatedDoc2 = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc2.id),
    });

    expect(updatedDoc1?.status).toBe("deleted");
    expect(updatedDoc1?.deletedAt).not.toBeNull(); // processing → soft deleted
    expect(updatedDoc2?.status).toBe("completed");
    expect(updatedDoc2?.deletedAt).toBeNull(); // completed → not deleted
  });
});
