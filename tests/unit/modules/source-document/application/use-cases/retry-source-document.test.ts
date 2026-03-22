import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelFlowTaskMock,
  findFirstMock,
  findManyTasksMock,
  getSourceDocumentTaskContextMock,
  insertMock,
  insertValuesMock,
  loggerDebugMock,
  prepareSourceDocumentTaskMock,
  processImagesMock,
  updateMock,
  updateSetMock,
  updateWhereMock: _updateWhereMock,
} = vi.hoisted(() => {
  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    cancelFlowTaskMock: vi.fn(),
    findFirstMock: vi.fn(),
    findManyTasksMock: vi.fn(),
    getSourceDocumentTaskContextMock: vi.fn(),
    insertMock,
    insertValuesMock,
    loggerDebugMock: vi.fn(),
    prepareSourceDocumentTaskMock: vi.fn(),
    processImagesMock: vi.fn(),
    updateMock,
    updateSetMock,
    updateWhereMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: findFirstMock,
      },
      taskRuns: {
        findMany: findManyTasksMock,
      },
    },
    insert: insertMock,
    update: updateMock,
  },
}));

vi.mock("@/lib/db/scoped-query", () => ({
  forLedger: vi.fn((_table: unknown, ledgerId: string) => ({
    whereId: vi.fn((id: string) => ({ ledgerId, id })),
  })),
}));

vi.mock("@/lib/flow", () => ({
  cancelFlowTask: cancelFlowTaskMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: loggerDebugMock,
  },
}));

vi.mock("@/modules/source-document/application/services/processing", () => ({
  getSourceDocumentTaskContext: getSourceDocumentTaskContextMock,
  prepareSourceDocumentTask: prepareSourceDocumentTaskMock,
  processImages: processImagesMock,
}));

import { NotFoundError } from "@/lib/errors";
import { retrySourceDocument } from "../../../../../../src/modules/source-document/application/use-cases/retry-source-document";

describe("retrySourceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyTasksMock.mockResolvedValue([]);
    getSourceDocumentTaskContextMock.mockResolvedValue({
      categories: [{ id: "cat-1", name: "Food" }],
      settings: { aiLanguage: "en", settings: {} },
    });
  });

  it("throws when the source document does not exist", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await expect(
      retrySourceDocument({
        ledgerId: "ledger-1",
        ledger: {
          id: "ledger-1",
          userId: "user-1",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        sourceDocumentId: "doc-1",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("reuses existing originals, falls back to existing imageUrls, cancels running tasks, and omits null text", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "doc-1",
      ledgerId: "ledger-1",
      entryDate: "2026-03-20",
      text: null,
      imageUrls: ["/api/uploads/old.jpg"],
      metadata: {
        originalImageUrls: ["/api/uploads/original.jpg"],
      },
    });
    findManyTasksMock.mockResolvedValueOnce([{ id: "task-1" }]);

    await retrySourceDocument({
      ledgerId: "ledger-1",
      ledger: {
        id: "ledger-1",
        userId: "user-1",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      sourceDocumentId: "doc-1",
      input: {
        originalImages: [{ data: "new-original", mimeType: "image/jpeg" }],
      },
    });

    expect(processImagesMock).not.toHaveBeenCalled();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        imageUrls: ["/api/uploads/old.jpg"],
        metadata: {
          originalImageUrls: ["/api/uploads/original.jpg"],
        },
      })
    );
    expect(cancelFlowTaskMock).toHaveBeenCalledWith("task-1");
    expect(updateSetMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ deletedAt: expect.any(Date) }));
    expect(updateSetMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ deletedAt: expect.any(Date) }));
    expect(prepareSourceDocumentTaskMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        text: expect.anything(),
      })
    );
  });
});
