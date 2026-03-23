import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getTestDb } from "tests/setup";
import { ledgers, sourceDocuments, taskRuns } from "@/persistence";

const { cancelFlowTaskMock } = vi.hoisted(() => ({
  cancelFlowTaskMock: vi.fn(),
}));

vi.mock("@/lib/flow", () => ({
  cancelFlowTask: cancelFlowTaskMock,
}));

import {
  batchCancelTasksUseCase,
  cancelTaskUseCase,
} from "@/modules/task-queue/application/use-cases/cancel-task";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("cancel-task use cases", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    cancelFlowTaskMock.mockResolvedValue(undefined);

    const db = getTestDb();
    ledgerId = uuidv4();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("propagates cancelFlowTask errors from cancelTaskUseCase", async () => {
    const db = getTestDb();
    const taskId = uuidv4();

    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Task",
      status: "running",
      scopeId: ledgerId,
    });

    cancelFlowTaskMock.mockRejectedValueOnce(new Error("cancel failed"));

    await expect(cancelTaskUseCase(ledgerId, taskId)).rejects.toThrow("cancel failed");
  });

  it("does not soft-delete anything when source-document entityId is null", async () => {
    const db = getTestDb();
    const taskId = uuidv4();

    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "Task without entityId",
      status: "running",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: null,
    });

    await expect(cancelTaskUseCase(ledgerId, taskId)).resolves.toBeUndefined();
    expect(cancelFlowTaskMock).toHaveBeenCalledWith(taskId);
  });

  it("batch-cancels valid tasks and soft-deletes only queued/processing source docs", async () => {
    const db = getTestDb();
    const processingDocId = uuidv4();
    const completedDocId = uuidv4();

    await db.insert(sourceDocuments).values([
      {
        id: processingDocId,
        ledgerId,
        text: "processing",
        status: "processing",
        type: "ai_parsed",
        imageUrls: [],
      },
      {
        id: completedDocId,
        ledgerId,
        text: "completed",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      },
    ]);

    const processingTaskId = uuidv4();
    const completedTaskId = uuidv4();
    const nullEntityTaskId = uuidv4();

    await db.insert(taskRuns).values([
      {
        id: processingTaskId,
        type: "parse_source_document",
        title: "processing task",
        status: "pending",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: processingDocId,
      },
      {
        id: completedTaskId,
        type: "parse_source_document",
        title: "completed doc task",
        status: "running",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: completedDocId,
      },
      {
        id: nullEntityTaskId,
        type: "parse_source_document",
        title: "null entity task",
        status: "running",
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: null,
      },
    ]);

    await batchCancelTasksUseCase(ledgerId, [processingTaskId, completedTaskId, nullEntityTaskId]);

    expect(cancelFlowTaskMock).toHaveBeenCalledTimes(3);
    expect(cancelFlowTaskMock).toHaveBeenCalledWith(processingTaskId);
    expect(cancelFlowTaskMock).toHaveBeenCalledWith(completedTaskId);
    expect(cancelFlowTaskMock).toHaveBeenCalledWith(nullEntityTaskId);

    const processingDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, processingDocId),
    });
    const completedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, completedDocId),
    });

    expect(processingDoc?.status).toBe("deleted");
    expect(processingDoc?.deletedAt).not.toBeNull();
    expect(completedDoc?.status).toBe("completed");
    expect(completedDoc?.deletedAt).toBeNull();
  });

  it("returns early in batchCancelTasksUseCase when no task is cancellable", async () => {
    const db = getTestDb();
    const taskId = uuidv4();

    await db.insert(taskRuns).values({
      id: taskId,
      type: "parse_source_document",
      title: "already completed",
      status: "completed",
      scopeId: ledgerId,
    });

    await batchCancelTasksUseCase(ledgerId, [taskId]);

    expect(cancelFlowTaskMock).not.toHaveBeenCalled();
  });
});
