import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sourceDocumentsFindFirstMock,
  sourceDocumentsFindManyMock,
  taskRunsFindManyMock,
  cancelFlowTaskMock,
  softDeleteSourceDocumentLedgerEntriesMock,
  txUpdateSetMock,
  txMock,
  transactionMock,
  loggerMock,
} = vi.hoisted(() => {
  const sourceDocumentsFindFirstMock = vi.fn();
  const sourceDocumentsFindManyMock = vi.fn();
  const taskRunsFindManyMock = vi.fn();
  const cancelFlowTaskMock = vi.fn();
  const softDeleteSourceDocumentLedgerEntriesMock = vi.fn();
  const txUpdateWhereMock = vi.fn(() => ({ run: vi.fn() }));
  const txUpdateSetMock = vi.fn(() => ({ where: txUpdateWhereMock }));
  const txMock = {
    update: vi.fn(() => ({ set: txUpdateSetMock })),
  };
  const transactionMock = vi.fn((callback: (tx: typeof txMock) => unknown) => callback(txMock));
  const loggerMock = {
    debug: vi.fn(),
  };

  return {
    sourceDocumentsFindFirstMock,
    sourceDocumentsFindManyMock,
    taskRunsFindManyMock,
    cancelFlowTaskMock,
    softDeleteSourceDocumentLedgerEntriesMock,
    txUpdateSetMock,
    txMock,
    transactionMock,
    loggerMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: sourceDocumentsFindFirstMock,
        findMany: sourceDocumentsFindManyMock,
      },
      taskRuns: {
        findMany: taskRunsFindManyMock,
      },
    },
    transaction: transactionMock,
  },
}));

vi.mock("@/persistence", () => ({
  sourceDocuments: {
    id: "sourceDocuments.id",
    ledgerId: "sourceDocuments.ledgerId",
    status: "sourceDocuments.status",
    deletedAt: "sourceDocuments.deletedAt",
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
    whereId: vi.fn((id: string) => ({ whereId: id })),
    whereActive: "whereActive",
    softDelete: { deletedAt: new Date("2026-03-20T00:00:00.000Z") },
  })),
}));

vi.mock("@/modules/source-document/application/source-document-state", () => ({
  deletedSourceDocumentPatch: vi.fn((now = new Date("2026-03-20T00:00:00.000Z")) => ({
    status: "deleted",
    deletedAt: now,
    updatedAt: now,
  })),
  whereSourceDocumentNotDeleted: vi.fn((ledgerId: string) => ({
    whereSourceDocumentNotDeleted: [ledgerId],
  })),
  whereSourceDocumentNotDeletedId: vi.fn((ledgerId: string, sourceDocumentId: string) => ({
    whereSourceDocumentNotDeletedId: [ledgerId, sourceDocumentId],
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...parts: unknown[]) => ({ and: parts })),
  eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ inArray: [column, values] })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  ne: vi.fn((left: unknown, right: unknown) => ({ ne: [left, right] })),
}));

vi.mock("@/lib/flow", () => ({
  cancelFlowTask: cancelFlowTaskMock,
}));

vi.mock("@/modules/source-document/application/services/source-document-ledger-entries", () => ({
  softDeleteSourceDocumentLedgerEntries: softDeleteSourceDocumentLedgerEntriesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

import {
  deleteSourceDocument,
  batchDeleteSourceDocuments,
} from "@/modules/source-document/application/use-cases/delete-source-document";

describe("deleteSourceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelFlowTaskMock.mockResolvedValue(undefined);
    taskRunsFindManyMock.mockResolvedValue([]);
  });

  it("returns deleted false when the document does not exist", async () => {
    sourceDocumentsFindFirstMock.mockResolvedValue(null);

    const result = await deleteSourceDocument({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
    });

    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      deleted: false,
    });
    expect(sourceDocumentsFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whereSourceDocumentNotDeletedId: ["ledger-1", "doc-1"] },
      })
    );
    expect(cancelFlowTaskMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("cancels running tasks and soft deletes related records in one transaction", async () => {
    sourceDocumentsFindFirstMock.mockResolvedValue({
      id: "doc-1",
      status: "completed",
      deletedAt: null,
    });
    taskRunsFindManyMock
      .mockResolvedValueOnce([
        { id: "task-1", status: "pending" },
        { id: "task-2", status: "completed" },
      ])
      .mockResolvedValueOnce([{ id: "task-1", status: "pending" }]);

    const result = await deleteSourceDocument({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
    });

    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      deleted: true,
    });
    expect(cancelFlowTaskMock).toHaveBeenCalledTimes(1);
    expect(cancelFlowTaskMock).toHaveBeenCalledWith("task-1");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(softDeleteSourceDocumentLedgerEntriesMock).toHaveBeenCalledWith(txMock, "ledger-1", [
      "doc-1",
    ]);
    expect(txMock.update).toHaveBeenCalledTimes(2);
    expect(txUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "deleted",
        deletedAt: expect.any(Date),
      })
    );
  });
});

describe("batchDeleteSourceDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelFlowTaskMock.mockResolvedValue(undefined);
    taskRunsFindManyMock.mockResolvedValue([]);
  });

  it("queries active source documents at the SQL boundary before deleting in batch", async () => {
    sourceDocumentsFindManyMock.mockResolvedValue([{ id: "doc-1" }, { id: "doc-2" }]);

    const result = await batchDeleteSourceDocuments({
      ledgerId: "ledger-1",
      sourceDocumentIds: ["doc-1", "doc-2"],
    });

    expect(result.deletedCount).toBe(2);
    expect(sourceDocumentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ whereSourceDocumentNotDeleted: ["ledger-1"] }]),
        }),
      })
    );
  });
});
