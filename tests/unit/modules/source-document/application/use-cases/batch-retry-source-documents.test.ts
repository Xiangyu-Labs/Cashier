import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sourceDocumentsFindManyMock,
  insertValuesMock,
  insertMock,
  getSourceDocumentTaskContextMock,
  prepareSourceDocumentTaskMock,
  rehomeLocalUploadUrlsMock,
  listRelatedSourceDocumentTaskRunsMock,
  cancelActiveSourceDocumentTaskRunsMock,
  softDeleteSourceDocumentsAndTaskRunsMock,
  transactionMock,
  loggerMock,
} = vi.hoisted(() => {
  const sourceDocumentsFindManyMock = vi.fn();
  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const getSourceDocumentTaskContextMock = vi.fn();
  const prepareSourceDocumentTaskMock = vi.fn();
  const rehomeLocalUploadUrlsMock = vi.fn();
  const listRelatedSourceDocumentTaskRunsMock = vi.fn();
  const cancelActiveSourceDocumentTaskRunsMock = vi.fn();
  const softDeleteSourceDocumentsAndTaskRunsMock = vi.fn();
  const transactionMock = vi.fn((callback: (tx: object) => void) => callback({}));
  const loggerMock = {
    debug: vi.fn(),
    warn: vi.fn(),
  };

  return {
    sourceDocumentsFindManyMock,
    insertValuesMock,
    insertMock,
    getSourceDocumentTaskContextMock,
    prepareSourceDocumentTaskMock,
    rehomeLocalUploadUrlsMock,
    listRelatedSourceDocumentTaskRunsMock,
    cancelActiveSourceDocumentTaskRunsMock,
    softDeleteSourceDocumentsAndTaskRunsMock,
    transactionMock,
    loggerMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findMany: sourceDocumentsFindManyMock,
      },
    },
    insert: insertMock,
    transaction: transactionMock,
  },
}));

vi.mock("@/persistence", () => ({
  sourceDocuments: {
    id: "sourceDocuments.id",
    ledgerId: "sourceDocuments.ledgerId",
  },
}));

vi.mock("@/modules/source-document/application/source-document-state", () => ({
  whereSourceDocumentNotDeleted: vi.fn((ledgerId: string) => ({
    whereSourceDocumentNotDeleted: [ledgerId],
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...parts: unknown[]) => ({ and: parts })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ inArray: [column, values] })),
}));

vi.mock("@/modules/source-document/application/services/source-document-lifecycle", () => ({
  listRelatedSourceDocumentTaskRuns: listRelatedSourceDocumentTaskRunsMock,
  cancelActiveSourceDocumentTaskRuns: cancelActiveSourceDocumentTaskRunsMock,
  softDeleteSourceDocumentsAndTaskRuns: softDeleteSourceDocumentsAndTaskRunsMock,
}));

vi.mock("@/modules/source-document/application/services/processing", () => ({
  getSourceDocumentTaskContext: getSourceDocumentTaskContextMock,
  prepareSourceDocumentTask: prepareSourceDocumentTaskMock,
}));

vi.mock("@/modules/source-document/application/services/rehome-local-upload-urls", () => ({
  rehomeLocalUploadUrls: rehomeLocalUploadUrlsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    ...loggerMock,
    error: vi.fn(),
  },
}));

import { batchRetrySourceDocuments } from "@/modules/source-document/application/use-cases/batch-retry-source-documents";

describe("batchRetrySourceDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockResolvedValue(undefined);
    listRelatedSourceDocumentTaskRunsMock.mockResolvedValue([]);
    cancelActiveSourceDocumentTaskRunsMock.mockResolvedValue(undefined);
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
    rehomeLocalUploadUrlsMock.mockImplementation(async ({ imageUrls }) => imageUrls);
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
    expect(listRelatedSourceDocumentTaskRunsMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("keeps successful retries when one task submission fails", async () => {
    sourceDocumentsFindManyMock.mockResolvedValue([
      {
        id: "old-1",
        text: "Lunch",
        entryDate: "2026-03-20",
        status: "anomaly",
        deletedAt: null,
        imageUrls: ["/img/1.jpg"],
      },
      {
        id: "old-2",
        text: "Dinner",
        entryDate: "2026-03-21",
        status: "failed",
        deletedAt: null,
        imageUrls: ["/img/2.jpg"],
      },
    ]);
    listRelatedSourceDocumentTaskRunsMock.mockResolvedValueOnce([
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

    expect(listRelatedSourceDocumentTaskRunsMock).toHaveBeenCalledWith("ledger-1", [
      "old-1",
      "old-2",
    ]);
    expect(cancelActiveSourceDocumentTaskRunsMock).toHaveBeenCalledWith(["task-1", "task-2"]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["old-1", "old-2"],
      ["task-1", "task-2"]
    );
    expect(sourceDocumentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ whereSourceDocumentNotDeleted: ["ledger-1"] }]),
        }),
      })
    );
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

  it("rehomes local image urls into the new source document namespace", async () => {
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue("new-1");
    sourceDocumentsFindManyMock.mockResolvedValue([
      {
        id: "old-1",
        text: "Specific text 1",
        entryDate: "2026-03-20",
        status: "failed",
        deletedAt: null,
        imageUrls: ["/api/uploads/ledger-1/old-1/local.webp"],
        metadata: { originalImageUrls: ["/api/uploads/ledger-1/old-1/original.webp"] },
      },
    ]);
    rehomeLocalUploadUrlsMock
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-1/local.webp"])
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-1/original.webp"]);

    try {
      await batchRetrySourceDocuments({
        ledgerId: "ledger-1",
        ledger: { id: "ledger-1", metadata: {} } as never,
        sourceDocumentIds: ["old-1"],
      });
    } finally {
      randomUUIDSpy.mockRestore();
    }

    expect(insertValuesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        imageUrls: ["/api/uploads/ledger-1/new-1/local.webp"],
        metadata: { originalImageUrls: ["/api/uploads/ledger-1/new-1/original.webp"] },
      }),
    ]);
    expect(sourceDocumentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ whereSourceDocumentNotDeleted: ["ledger-1"] }]),
        }),
      })
    );
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["old-1"],
      []
    );
  });
});
