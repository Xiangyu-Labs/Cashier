import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/errors";

const { downloadMock, uploadMock, extractKeyFromUrlMock, getLocalStorageMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  uploadMock: vi.fn(),
  extractKeyFromUrlMock: vi.fn(),
  getLocalStorageMock: vi.fn(),
}));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: getLocalStorageMock,
}));

import { rehomeLocalUploadUrls } from "./rehome-local-upload-urls";

describe("rehomeLocalUploadUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalStorageMock.mockReturnValue({
      download: downloadMock,
      upload: uploadMock,
      extractKeyFromUrl: extractKeyFromUrlMock,
    });
  });

  it("copies a legacy local upload URL into the new source document namespace", async () => {
    extractKeyFromUrlMock.mockReturnValue("ledger-1/old-doc/receipt.webp");
    downloadMock.mockResolvedValue(Buffer.from("image-bytes"));
    uploadMock.mockResolvedValue("/api/uploads/ledger-1/new-doc/receipt.webp");

    const result = await rehomeLocalUploadUrls({
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: ["/api/uploads/ledger-1/old-doc/receipt.webp"],
    });

    expect(downloadMock).toHaveBeenCalledWith("ledger-1/old-doc/receipt.webp");
    expect(uploadMock).toHaveBeenCalledWith(
      "ledger-1/new-doc/receipt.webp",
      Buffer.from("image-bytes"),
      "image/webp"
    );
    expect(result).toEqual(["/api/uploads/ledger-1/new-doc/receipt.webp"]);
  });

  it("preserves external URLs and already-owned local URLs", async () => {
    extractKeyFromUrlMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/uploads/")) {
        return url.slice("/api/uploads/".length);
      }
      return null;
    });

    const result = await rehomeLocalUploadUrls({
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: [
        "https://bucket.r2.dev/ledger-1/doc-1/image.jpg",
        "/api/uploads/ledger-1/new-doc/already-owned.webp",
      ],
    });

    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result).toEqual([
      "https://bucket.r2.dev/ledger-1/doc-1/image.jpg",
      "/api/uploads/ledger-1/new-doc/already-owned.webp",
    ]);
  });

  it("passes through local uploads when the storage key cannot be inferred", async () => {
    extractKeyFromUrlMock.mockReturnValue(null);

    const localUrl = "/api/uploads/ledger-1/new-doc/unmappable.webp";
    const result = await rehomeLocalUploadUrls({
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: [localUrl],
    });

    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result).toEqual([localUrl]);
  });

  it("passes through malformed extracted keys instead of rehoming", async () => {
    extractKeyFromUrlMock.mockReturnValue("old.jpg");

    const localUrl = "/api/uploads/ledger-1/blah/old.jpg";
    const result = await rehomeLocalUploadUrls({
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: [localUrl],
    });

    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result).toEqual([localUrl]);
  });

  it("rejects local upload URLs when the ledger differs even if doc ID matches", async () => {
    extractKeyFromUrlMock.mockReturnValue("other-ledger/new-doc/image.webp");

    const crossLedgerUrl = "/api/uploads/other-ledger/new-doc/image.webp";

    await expect(
      rehomeLocalUploadUrls({
        ledgerId: "ledger-1",
        sourceDocumentId: "new-doc",
        imageUrls: [crossLedgerUrl],
      })
    ).rejects.toThrow(ValidationError);

    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
