import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  formatDateTimeForApiMock,
  getDateInTimezoneMock,
  getSourceDocumentTaskContextMock,
  insertMock,
  insertReturningMock,
  insertValuesMock,
  prepareSourceDocumentTaskMock,
  processImagesMock,
  updateMock,
  updateSetMock,
  updateWhereMock,
} = vi.hoisted(() => {
  const insertReturningMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    formatDateTimeForApiMock: vi.fn(),
    getDateInTimezoneMock: vi.fn(),
    getSourceDocumentTaskContextMock: vi.fn(),
    insertMock,
    insertReturningMock,
    insertValuesMock,
    prepareSourceDocumentTaskMock: vi.fn(),
    processImagesMock: vi.fn(),
    updateMock,
    updateSetMock,
    updateWhereMock,
  };
});

vi.mock("@/lib/date-utils", () => ({
  formatDateTimeForApi: formatDateTimeForApiMock,
  getDateInTimezone: getDateInTimezoneMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: insertMock,
    update: updateMock,
  },
}));

vi.mock("@/lib/db/scoped-query", () => ({
  forLedger: vi.fn((_table: unknown, ledgerId: string) => ({
    whereId: vi.fn((id: string) => ({ ledgerId, id })),
  })),
}));

vi.mock("../services/processing", () => ({
  getSourceDocumentTaskContext: getSourceDocumentTaskContextMock,
  prepareSourceDocumentTask: prepareSourceDocumentTaskMock,
  processImages: processImagesMock,
}));

import { ValidationError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "./create-and-queue-source-document";

describe("createAndQueueSourceDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDateInTimezoneMock.mockReturnValue("2026-03-20");
    formatDateTimeForApiMock.mockReturnValue("2026-03-21");
    insertReturningMock.mockResolvedValue([{ id: "doc-1" }]);
    processImagesMock.mockResolvedValue([]);
    getSourceDocumentTaskContextMock.mockResolvedValue({
      categories: [{ id: "cat-1", name: "Food" }],
      settings: { aiLanguage: "en", settings: {} },
    });
  });

  it("rejects invalid input without text or images", async () => {
    await expect(
      createAndQueueSourceDocument({
        ledgerId: "ledger-1",
        ledger: {
          id: "ledger-1",
          userId: "user-1",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      })
    ).rejects.toThrow(ValidationError);

    expect(insertMock).not.toHaveBeenCalled();
    expect(processImagesMock).not.toHaveBeenCalled();
  });

  it("creates queued document, resolves entry date from timezone, and updates image metadata", async () => {
    processImagesMock.mockResolvedValueOnce(["/api/uploads/doc-1/a.jpg"]).mockResolvedValueOnce([
      "/api/uploads/doc-1/original.jpg",
    ]);

    const result = await createAndQueueSourceDocument({
      ledgerId: "ledger-1",
      ledger: {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { aiLanguage: "en" } },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      text: "Lunch receipt",
      images: [{ data: "base64-image", mimeType: "image/jpeg" }],
      originalImages: [{ data: "base64-original", mimeType: "image/jpeg" }],
      timezone: "Asia/Shanghai",
    });

    expect(insertValuesMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      text: "Lunch receipt",
      imageUrls: [],
      status: "queued",
      entryDate: "2026-03-20",
    });
    expect(processImagesMock).toHaveBeenNthCalledWith(1, expect.any(Array), "ledger-1", "doc-1");
    expect(processImagesMock).toHaveBeenNthCalledWith(2, expect.any(Array), "ledger-1", "doc-1");
    expect(prepareSourceDocumentTaskMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      imageUrls: ["/api/uploads/doc-1/a.jpg"],
      categories: [{ id: "cat-1", name: "Food" }],
      settings: { aiLanguage: "en", settings: {} },
      text: "Lunch receipt",
    });
    expect(updateSetMock).toHaveBeenCalledWith({
      imageUrls: ["/api/uploads/doc-1/a.jpg"],
      metadata: {
        originalImageUrls: ["/api/uploads/doc-1/original.jpg"],
      },
    });
    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      status: "queued",
    });
  });

  it("falls back to formatted current date when timezone does not resolve", async () => {
    getDateInTimezoneMock.mockReturnValueOnce(undefined);

    await createAndQueueSourceDocument({
      ledgerId: "ledger-1",
      ledger: {
        id: "ledger-1",
        userId: "user-1",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      text: "Text only",
      timezone: "UTC",
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: "2026-03-21",
      })
    );
  });
});
