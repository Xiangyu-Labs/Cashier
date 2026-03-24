import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelActiveSourceDocumentTaskRunsMock,
  findFirstMock,
  getSourceDocumentTaskContextMock,
  insertMock,
  insertValuesMock,
  listRelatedSourceDocumentTaskRunsMock,
  loggerDebugMock,
  prepareSourceDocumentTaskMock,
  processImagesMock,
  rehomeLocalUploadUrlsMock,
  softDeleteSourceDocumentsAndTaskRunsMock,
  transactionMock,
} = vi.hoisted(() => {
  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const transactionMock = vi.fn((callback: (tx: object) => void) => callback({}));

  return {
    cancelActiveSourceDocumentTaskRunsMock: vi.fn(),
    findFirstMock: vi.fn(),
    getSourceDocumentTaskContextMock: vi.fn(),
    insertMock,
    insertValuesMock,
    listRelatedSourceDocumentTaskRunsMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    prepareSourceDocumentTaskMock: vi.fn(),
    processImagesMock: vi.fn(),
    rehomeLocalUploadUrlsMock: vi.fn(),
    softDeleteSourceDocumentsAndTaskRunsMock: vi.fn(),
    transactionMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: findFirstMock,
      },
    },
    insert: insertMock,
    transaction: transactionMock,
  },
}));

vi.mock("@/modules/source-document/application/source-document-state", () => ({
  whereSourceDocumentNotDeletedId: vi.fn((ledgerId: string, sourceDocumentId: string) => ({
    whereSourceDocumentNotDeletedId: [ledgerId, sourceDocumentId],
  })),
}));

vi.mock("@/modules/source-document/application/services/source-document-lifecycle", () => ({
  listRelatedSourceDocumentTaskRuns: listRelatedSourceDocumentTaskRunsMock,
  cancelActiveSourceDocumentTaskRuns: cancelActiveSourceDocumentTaskRunsMock,
  softDeleteSourceDocumentsAndTaskRuns: softDeleteSourceDocumentsAndTaskRunsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: loggerDebugMock,
    error: vi.fn(),
  },
}));

vi.mock("@/modules/source-document/application/services/processing", () => ({
  getSourceDocumentTaskContext: getSourceDocumentTaskContextMock,
  prepareSourceDocumentTask: prepareSourceDocumentTaskMock,
  processImages: processImagesMock,
}));

vi.mock("@/modules/source-document/application/services/rehome-local-upload-urls", () => ({
  rehomeLocalUploadUrls: rehomeLocalUploadUrlsMock,
}));

import { NotFoundError } from "@/lib/errors";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";

describe("retrySourceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRelatedSourceDocumentTaskRunsMock.mockResolvedValue([]);
    cancelActiveSourceDocumentTaskRunsMock.mockResolvedValue(undefined);
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

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whereSourceDocumentNotDeletedId: ["ledger-1", "doc-1"] },
      })
    );
  });

  it("reuses existing originals, falls back to existing imageUrls, cancels related tasks, and omits null text", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "doc-1",
      ledgerId: "ledger-1",
      entryDate: "2026-03-20",
      text: null,
      status: "failed",
      deletedAt: null,
      imageUrls: ["/api/uploads/old.jpg"],
      metadata: {
        originalImageUrls: ["/api/uploads/original.jpg"],
      },
    });
    listRelatedSourceDocumentTaskRunsMock.mockResolvedValueOnce([{ id: "task-1" }]);
    rehomeLocalUploadUrlsMock
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/current.webp"])
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/original.webp"]);

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
        imageUrls: ["/api/uploads/ledger-1/new-doc/current.webp"],
        metadata: {
          originalImageUrls: ["/api/uploads/ledger-1/new-doc/original.webp"],
        },
      })
    );
    expect(listRelatedSourceDocumentTaskRunsMock).toHaveBeenCalledWith("ledger-1", ["doc-1"]);
    expect(cancelActiveSourceDocumentTaskRunsMock).toHaveBeenCalledWith(["task-1"]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["doc-1"],
      ["task-1"]
    );
    expect(prepareSourceDocumentTaskMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        text: expect.anything(),
      })
    );
  });

  it("rehomes local urls returned from processImages when retry input provides images and originalImages", async () => {
    const randomUUIDMock = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-doc");
    findFirstMock.mockResolvedValueOnce({
      id: "doc-1",
      ledgerId: "ledger-1",
      entryDate: "2026-03-20",
      text: "old text",
      status: "anomaly",
      deletedAt: null,
      imageUrls: ["/api/uploads/ledger-1/doc-1/fallback.webp"],
      metadata: {},
    });
    processImagesMock
      .mockResolvedValueOnce(["/api/uploads/ledger-1/doc-1/current-from-input.webp"])
      .mockResolvedValueOnce(["/api/uploads/ledger-1/doc-1/original-from-input.webp"]);
    rehomeLocalUploadUrlsMock
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/current-from-input.webp"])
      .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/original-from-input.webp"]);

    try {
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
          text: "retry text",
          images: [{ data: "current-input", mimeType: "image/webp" }],
          originalImages: [{ data: "original-input", mimeType: "image/webp" }],
        },
      });
    } finally {
      randomUUIDMock.mockRestore();
    }

    expect(rehomeLocalUploadUrlsMock).toHaveBeenNthCalledWith(1, {
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: ["/api/uploads/ledger-1/doc-1/current-from-input.webp"],
    });
    expect(rehomeLocalUploadUrlsMock).toHaveBeenNthCalledWith(2, {
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: ["/api/uploads/ledger-1/doc-1/original-from-input.webp"],
    });
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ["/api/uploads/ledger-1/new-doc/current-from-input.webp"],
        metadata: {
          originalImageUrls: ["/api/uploads/ledger-1/new-doc/original-from-input.webp"],
        },
      })
    );
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["doc-1"],
      []
    );
  });

  it("uses input.entryDate when provided, ignoring existingDocument.entryDate", async () => {
    const randomUUIDMock = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-doc");
    findFirstMock.mockResolvedValueOnce({
      id: "doc-1",
      ledgerId: "ledger-1",
      entryDate: "2026-03-10",
      text: "t",
      status: "failed",
      deletedAt: null,
      imageUrls: [],
      metadata: {},
    });
    processImagesMock.mockResolvedValueOnce([]);
    rehomeLocalUploadUrlsMock.mockImplementation(({ imageUrls }: { imageUrls: string[] }) =>
      Promise.resolve(imageUrls)
    );

    await retrySourceDocument({
      ledgerId: "ledger-1",
      ledger: {
        id: "ledger-1",
        userId: "u",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      sourceDocumentId: "doc-1",
      input: { entryDate: "2026-03-22" },
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: "2026-03-22" })
    );
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["doc-1"],
      []
    );
    randomUUIDMock.mockRestore();
  });

  it("falls back to existingDocument.entryDate when input.entryDate not provided", async () => {
    const randomUUIDMock = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("new-doc");
    findFirstMock.mockResolvedValueOnce({
      id: "doc-1",
      ledgerId: "ledger-1",
      entryDate: "2026-03-10",
      text: "t",
      status: "failed",
      deletedAt: null,
      imageUrls: [],
      metadata: {},
    });
    processImagesMock.mockResolvedValueOnce([]);
    rehomeLocalUploadUrlsMock.mockImplementation(({ imageUrls }: { imageUrls: string[] }) =>
      Promise.resolve(imageUrls)
    );

    await retrySourceDocument({
      ledgerId: "ledger-1",
      ledger: {
        id: "ledger-1",
        userId: "u",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      sourceDocumentId: "doc-1",
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: "2026-03-10" })
    );
    expect(softDeleteSourceDocumentsAndTaskRunsMock).toHaveBeenCalledWith(
      {},
      "ledger-1",
      ["doc-1"],
      []
    );
    randomUUIDMock.mockRestore();
  });
});
