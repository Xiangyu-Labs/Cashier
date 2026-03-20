import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sourceDocumentsFindFirstMock,
  processImagesMock,
  updateReturningMock,
  updateWhereMock,
  updateSetMock,
  updateMock,
} = vi.hoisted(() => {
  const sourceDocumentsFindFirstMock = vi.fn();
  const processImagesMock = vi.fn();
  const updateReturningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    sourceDocumentsFindFirstMock,
    processImagesMock,
    updateReturningMock,
    updateWhereMock,
    updateSetMock,
    updateMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: sourceDocumentsFindFirstMock,
      },
    },
    update: updateMock,
  },
}));

vi.mock("@/persistence", () => ({
  sourceDocuments: {
    id: "sourceDocuments.id",
  },
}));

vi.mock("@/lib/db/scoped-query", () => ({
  forLedger: vi.fn(() => ({
    whereId: vi.fn((id: string) => ({ whereId: id })),
    whereActive: "whereActive",
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...parts: unknown[]) => ({ and: parts })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ inArray: [column, values] })),
}));

vi.mock("../services/processing", () => ({
  processImages: processImagesMock,
}));

import { updateSourceDocumentImages } from "./update-source-document";

describe("updateSourceDocumentImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockReturnValue({ set: updateSetMock });
    updateReturningMock.mockResolvedValue([{ id: "doc-1" }]);
  });

  it("preserves the replaced image as an original image when metadata does not have one yet", async () => {
    sourceDocumentsFindFirstMock.mockResolvedValue({
      id: "doc-1",
      imageUrls: ["https://cdn.example.com/old-image.jpg", "https://cdn.example.com/keep.jpg"],
      metadata: { note: "keep" },
    });
    processImagesMock.mockResolvedValue([
      "https://cdn.example.com/new-image.jpg",
      "https://cdn.example.com/keep.jpg",
    ]);

    const result = await updateSourceDocumentImages({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      images: [{ data: "image-data", mimeType: "image/jpeg" }],
    });

    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      updated: true,
    });
    expect(processImagesMock).toHaveBeenCalledTimes(1);

    const updatePayload = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload.imageUrls).toEqual([
      "https://cdn.example.com/new-image.jpg",
      "https://cdn.example.com/keep.jpg",
    ]);
    expect(updatePayload.metadata).toEqual({
      note: "keep",
      originalImageUrls: ["https://cdn.example.com/old-image.jpg"],
    });
  });
});
