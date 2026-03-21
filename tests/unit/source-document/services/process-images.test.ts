import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getLocalStorageMock,
  isSupportedImageFormatMock,
  listEntryCategoryInfosMock,
  loggerDebugMock,
  processImageMock,
} = vi.hoisted(() => ({
  getLocalStorageMock: vi.fn(),
  isSupportedImageFormatMock: vi.fn(),
  listEntryCategoryInfosMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  processImageMock: vi.fn(),
}));

vi.mock("@/modules/ledger/source-document-queries", () => ({
  listEntryCategoryInfos: listEntryCategoryInfosMock,
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
});
