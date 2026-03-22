import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sourceDocumentsFindManyMock,
  taskRunsFindManyMock,
  insertValuesMock,
  insertMock,
  updateSourceDocumentsWhereMock,
  updateSourceDocumentsSetMock,
  updateTaskRunsWhereMock,
  updateTaskRunsSetMock,
  updateMock,
  cancelFlowTaskMock,
  getSourceDocumentTaskContextMock,
  prepareSourceDocumentTaskMock,
  loggerMock,
} = vi.hoisted(() => {
  const sourceDocumentsFindManyMock = vi.fn();
  const taskRunsFindManyMock = vi.fn();
  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const updateSourceDocumentsWhereMock = vi.fn();
  const updateSourceDocumentsSetMock = vi.fn(() => ({ where: updateSourceDocumentsWhereMock }));
  const updateTaskRunsWhereMock = vi.fn();
  const updateTaskRunsSetMock = vi.fn(() => ({ where: updateTaskRunsWhereMock }));
  const updateMock = vi.fn();
  const cancelFlowTaskMock = vi.fn();
  const getSourceDocumentTaskContextMock = vi.fn();
  const prepareSourceDocumentTaskMock = vi.fn();
  const loggerMock = {
    debug: vi.fn(),
    warn: vi.fn(),
  };

  return {
    sourceDocumentsFindManyMock,
    taskRunsFindManyMock,
    insertValuesMock,
    insertMock,
    updateSourceDocumentsWhereMock,
    updateSourceDocumentsSetMock,
    updateTaskRunsWhereMock,
    updateTaskRunsSetMock,
    updateMock,
    cancelFlowTaskMock,
    getSourceDocumentTaskContextMock,
    prepareSourceDocumentTaskMock,
    loggerMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findMany: sourceDocumentsFindManyMock,
      },
      taskRuns: {
        findMany: taskRunsFindManyMock,
      },
    },
    insert: insertMock,
    update: updateMock,
  },
}));

vi.mock("@/persistence", () => ({
  sourceDocuments: {
    id: "sourceDocuments.id",
    ledgerId: "sourceDocuments.ledgerId",
  },
  taskRuns: {
    id: "taskRuns.id",
    deletedAt: "taskRuns.deletedAt",
    scopeId: "taskRuns.scopeId",
    entityType: "taskRuns.entityType",
    entityId: "taskRuns.entityId",
    status: "taskRuns.status",
  },
}));

vi.mock("@/lib/db/scoped-query", () => ({
  forLedger: vi.fn(() => ({
    whereActive: "whereActive",
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...parts: unknown[]) => ({ and: parts })),
  eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ inArray: [column, values] })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
}));

vi.mock("@/lib/flow", () => ({
  cancelFlowTask: cancelFlowTaskMock,
}));

vi.mock("@/modules/source-document/application/services/processing", () => ({
  getSourceDocumentTaskContext: getSourceDocumentTaskContextMock,
  prepareSourceDocumentTask: prepareSourceDocumentTaskMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

import { batchRetrySourceDocuments } from "@/modules/source-document/application/use-cases/batch-retry-source-documents";

describe("batchRetrySourceDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    insertMock.mockReturnValue({ values: insertValuesMock });
    updateMock
      .mockImplementationOnce(() => ({ set: updateSourceDocumentsSetMock }))
      .mockImplementationOnce(() => ({ set: updateTaskRunsSetMock }));

    insertValuesMock.mockResolvedValue(undefined);
    updateSourceDocumentsWhereMock.mockResolvedValue(undefined);
    updateTaskRunsWhereMock.mockResolvedValue(undefined);
    cancelFlowTaskMock.mockResolvedValue(undefined);
    getSourceDocumentTaskContextMock.mockResolvedValue({
      categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
      settings: {
        aiLanguage: "en",
        preferredCurrencies: ["USD"],
        settings: {
          aiCustomPrompt: "Be strict",
        },
      },
    });
    prepareSourceDocumentTaskMock.mockResolvedValue(undefined);
  });

  it("returns immediately for an empty document list", async () => {
    const result = await batchRetrySourceDocuments({
      ledgerId: "ledger-1",
      ledger: { id: "ledger-1", metadata: {} } as never,
      sourceDocumentIds: [],
    });

    expect(result).toEqual({
      results: [],
      retriedCount: 0,
      failedCount: 0,
    });
    expect(sourceDocumentsFindManyMock).not.toHaveBeenCalled();
    expect(taskRunsFindManyMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("keeps successful retries when one task submission fails", async () => {
    sourceDocumentsFindManyMock.mockResolvedValue([
      {
        id: "old-1",
        text: "Lunch",
        entryDate: "2026-03-20",
        imageUrls: ["/img/1.jpg"],
      },
      {
        id: "old-2",
        text: "Dinner",
        entryDate: "2026-03-21",
        imageUrls: ["/img/2.jpg"],
      },
    ]);
    taskRunsFindManyMock.mockResolvedValue([
      { id: "task-1", status: "pending" },
      { id: "task-2", status: "completed" },
    ]);
    prepareSourceDocumentTaskMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("submit failed"));

    const result = await batchRetrySourceDocuments({
      ledgerId: "ledger-1",
      ledger: { id: "ledger-1", metadata: {} } as never,
      sourceDocumentIds: ["old-1", "old-2"],
    });

    expect(cancelFlowTaskMock).toHaveBeenCalledTimes(1);
    expect(cancelFlowTaskMock).toHaveBeenCalledWith("task-1");
    expect(insertValuesMock).toHaveBeenCalledTimes(1);

    const insertedDocuments = insertValuesMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertedDocuments).toHaveLength(2);
    expect(insertedDocuments[0]?.ledgerId).toBe("ledger-1");
    expect(insertedDocuments[1]?.ledgerId).toBe("ledger-1");

    expect(prepareSourceDocumentTaskMock).toHaveBeenCalledTimes(2);
    expect(result.retriedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.previousSourceDocumentId).toBe("old-1");
    expect(result.results[1]?.previousSourceDocumentId).toBe("old-2");
    expect(result.results[0]?.taskSubmitted).toBe(true);
    expect(result.results[1]?.taskSubmitted).toBe(false);
  });
});
