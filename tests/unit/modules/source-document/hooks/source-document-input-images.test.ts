import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/image-utils";
import { loadSourceDocumentInputFiles } from "@/modules/source-document/hooks/source-document-input-images";

vi.mock("@/lib/image-utils", () => ({
  compressImage: vi.fn(),
}));

describe("source-document-input-images", () => {
  const originalFileReader = globalThis.FileReader;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.FileReader = originalFileReader;
  });

  it("returns a ready editable image when compression succeeds", async () => {
    vi.mocked(compressImage).mockResolvedValueOnce({
      data: "compressed-image",
      mimeType: "image/png",
    } as never);

    const results = await loadSourceDocumentInputFiles([
      new File(["image"], "receipt.png", { type: "image/png" }),
    ]);

    expect(results).toEqual([
      {
        kind: "ready",
        image: {
          data: "compressed-image",
          mimeType: "image/png",
          originalData: "compressed-image",
          originalMimeType: "image/png",
          isEdited: false,
        },
      },
    ]);
  });

  it("falls back to FileReader for small files when compression fails", async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error("Compression failed"));

    class MockFileReader {
      result: string | ArrayBuffer | null = "data:image/webp;base64,fallback-image";
      error: DOMException | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

    const results = await loadSourceDocumentInputFiles([
      new File(["image"], "receipt.webp", { type: "image/webp" }),
    ]);

    expect(results).toEqual([
      {
        kind: "ready",
        image: {
          data: "data:image/webp;base64,fallback-image",
          mimeType: "image/webp",
          originalData: "data:image/webp;base64,fallback-image",
          originalMimeType: "image/webp",
          isEdited: false,
        },
      },
    ]);
  });

  it("returns a too-large result when fallback is blocked by file size", async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error("Compression failed"));
    const largeFile = new File(["image"], "huge.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", {
      value: 5 * 1024 * 1024 + 1,
      configurable: true,
    });

    const results = await loadSourceDocumentInputFiles([largeFile]);

    expect(results).toEqual([{ kind: "too-large", fileName: "huge.png" }]);
  });
});
