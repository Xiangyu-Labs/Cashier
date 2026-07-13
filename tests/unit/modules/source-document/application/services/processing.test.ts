import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getLocalStorageMock,
  isSupportedImageFormatMock,
  listEntryCategoryInfosMock,
  loggerDebugMock,
  processImageMock,
  submitMock,
} = vi.hoisted(() => ({
  getLocalStorageMock: vi.fn(),
  isSupportedImageFormatMock: vi.fn(),
  listEntryCategoryInfosMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  processImageMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock("@/modules/ledger/source-document-queries", () => ({
  listEntryCategoryInfos: listEntryCategoryInfosMock,
}));

vi.mock("@/lib/tasks", () => ({
  submitTask: submitMock,
}));

vi.mock("@/lib/storage/image-processing", () => ({
  isSupportedImageFormat: isSupportedImageFormatMock,
  processImage: processImageMock,
}));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: getLocalStorageMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: loggerDebugMock,
  },
}));

import { ValidationError } from "@/lib/errors";
import {
  getSourceDocumentTaskContext,
  prepareSourceDocumentTask,
  processImages,
} from "@/modules/source-document/application/services/processing";

describe("source-document processing helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEntryCategoryInfosMock.mockResolvedValue([{ id: "cat-1", name: "Food" }]);
    getLocalStorageMock.mockReturnValue({
      upload: vi.fn(async (key: string) => `/api/uploads/${key}`),
    });
    isSupportedImageFormatMock.mockReturnValue(false);
    processImageMock.mockResolvedValue({
      buffer: new Uint8Array(Buffer.from("processed")),
      mimeType: "image/webp",
    });
    submitMock.mockResolvedValue("task-id");
  });

  it("builds task context with defaults and optional ledger settings", async () => {
    const context = await getSourceDocumentTaskContext("ledger-1", {
      id: "ledger-1",
      userId: "user-1",
      metadata: {
        settings: {
          aiLanguage: "en",
          currencies: ["USD", "CNY"],
          aiCustomPrompt: "be strict",
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    expect(context).toEqual({
      categories: [{ id: "cat-1", name: "Food" }],
      settings: {
        aiLanguage: "en",
        preferredCurrencies: ["USD", "CNY"],
        settings: {
          aiCustomPrompt: "be strict",
        },
      },
    });
  });

  it("passes through existing URLs without uploading them again", async () => {
    const result = await processImages(
      [
        { data: "https://example.com/a.jpg", mimeType: "image/jpeg" },
        { data: "/api/uploads/existing.jpg", mimeType: "image/jpeg" },
      ],
      "ledger-1",
      "doc-1"
    );

    expect(result).toEqual(["https://example.com/a.jpg", "/api/uploads/existing.jpg"]);
    expect(getLocalStorageMock().upload).not.toHaveBeenCalled();
  });

  it("compresses supported images, uploads with mapped extension, and returns uploaded URLs", async () => {
    isSupportedImageFormatMock.mockReturnValueOnce(true);

    const result = await processImages(
      [
        {
          data: Buffer.from("raw-image").toString("base64"),
          mimeType: "image/jpeg",
        },
      ],
      "ledger-1",
      "doc-1"
    );

    const storage = getLocalStorageMock.mock.results[0]?.value;
    expect(processImageMock).toHaveBeenCalled();
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^ledger-1\/doc-1\/.+\.webp$/),
      expect.any(Buffer),
      "image/webp"
    );
    expect(result[0]).toMatch(/^\/api\/uploads\/ledger-1\/doc-1\//);
  });

  it("rejects raw files larger than 10MB before upload", async () => {
    const hugeBase64 = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");

    await expect(
      processImages(
        [
          {
            data: hugeBase64,
            mimeType: "image/jpeg",
          },
        ],
        "ledger-1",
        "doc-1"
      )
    ).rejects.toThrow(ValidationError);
  });

  it("submits parse_source_document with the assembled flow capability", async () => {
    await prepareSourceDocumentTask({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      text: "Lunch 25",
      imageUrls: ["/api/uploads/test.jpg"],
      categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
      settings: {
        aiLanguage: "en",
        preferredCurrencies: ["USD"],
        settings: {
          aiCustomPrompt: "Be strict",
        },
      },
    });

    expect(submitMock).toHaveBeenCalledWith(
      "parse_source_document",
      {
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-1",
        text: "Lunch 25",
        imageUrls: ["/api/uploads/test.jpg"],
        aiLanguage: "en",
        preferredCurrencies: ["USD"],
        categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
        settings: {
          aiCustomPrompt: "Be strict",
        },
      },
      {
        title: "Parse source document",
        scopeId: "ledger-1",
        entityType: "source_document",
        entityId: "doc-1",
        deduplicationKey: "parse:doc-1:1",
      }
    );
  });

  it("omits optional task payload fields when they are absent", async () => {
    await prepareSourceDocumentTask({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      imageUrls: ["/api/uploads/test.jpg"],
      categories: [],
      settings: {
        aiLanguage: "en",
        settings: {},
      },
    });

    const submitInput = submitMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(submitInput).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(submitInput, "text")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(submitInput, "preferredCurrencies")).toBe(false);
  });

  it("omits optional settings fields when ledger metadata does not provide them", async () => {
    const context = await getSourceDocumentTaskContext("ledger-1", {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: {} },
      createdAt: new Date("2026-03-19T12:00:00.000Z"),
      updatedAt: new Date("2026-03-19T12:00:00.000Z"),
      deletedAt: null,
    });

    expect("preferredCurrencies" in context.settings).toBe(false);
    expect("aiCustomPrompt" in context.settings.settings).toBe(false);
  });
});
