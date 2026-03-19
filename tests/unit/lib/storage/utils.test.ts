import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadImageForAI,
  loadImagesForAI,
  loadImagesForAIOrThrow,
  inferImageMimeType,
} from "@/lib/storage/utils";
import * as localModule from "@/lib/storage/local";

// Mock the local storage module
vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: vi.fn(),
}));

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

describe("storage/utils", () => {
  const mockStorage = {
    extractKeyFromUrl: vi.fn(),
    download: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(localModule.getLocalStorage).mockReturnValue(
      mockStorage as unknown as ReturnType<typeof localModule.getLocalStorage>
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("loadImageForAI", () => {
    it("should download from local storage for local upload URLs", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValue("test-key.jpg");
      mockStorage.download.mockResolvedValue(Buffer.from("fake-image-data"));

      const result = await loadImageForAI("/api/uploads/test-key.jpg");

      expect(mockStorage.extractKeyFromUrl).toHaveBeenCalledWith("/api/uploads/test-key.jpg");
      expect(mockStorage.download).toHaveBeenCalledWith("test-key.jpg");
      expect(result).toBe("data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh");
    });

    it("should throw error for invalid local upload URL", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValue(null);

      await expect(loadImageForAI("/api/uploads/invalid")).rejects.toThrow(
        "Invalid local upload URL"
      );
    });

    it("should throw error for external HTTP URLs", async () => {
      await expect(loadImageForAI("https://example.com/image.jpg")).rejects.toThrow(
        "Invalid image URL format. Only local upload URLs"
      );
    });

    it("should return base64 data URLs as-is", async () => {
      const dataUrl = "data:image/jpeg;base64,/9j/4AAQ...";
      const result = await loadImageForAI(dataUrl);
      expect(result).toBe(dataUrl);
    });

    it("should use correct MIME type based on file extension for local uploads", async () => {
      mockStorage.download.mockResolvedValue(Buffer.from("fake"));

      // PNG extension
      mockStorage.extractKeyFromUrl.mockReturnValue("key.png");
      let result = await loadImageForAI("/api/uploads/key.png");
      expect(result).toMatch(/^data:image\/png;/);

      // WebP extension
      mockStorage.extractKeyFromUrl.mockReturnValue("key.webp");
      result = await loadImageForAI("/api/uploads/key.webp");
      expect(result).toMatch(/^data:image\/webp;/);
    });
  });

  describe("loadImagesForAI", () => {
    it("should load multiple images with partial failure handling", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValueOnce("key1.jpg").mockReturnValueOnce("key2.png");
      mockStorage.download
        .mockResolvedValueOnce(Buffer.from("fake-image-1"))
        .mockResolvedValueOnce(Buffer.from("fake-image-2"));

      const results = await loadImagesForAI(["/api/uploads/key1.jpg", "/api/uploads/key2.png"]);

      expect(results).toHaveLength(2);
      const firstResult = requireDefined(results[0], "Expected first load result");
      const secondResult = requireDefined(results[1], "Expected second load result");
      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
    });

    it("should handle mixed base64 and local URLs", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValue("key.jpg");
      mockStorage.download.mockResolvedValue(Buffer.from("fake-image"));

      const results = await loadImagesForAI([
        "data:image/jpeg;base64,abc123",
        "/api/uploads/key.jpg",
      ]);

      expect(results).toHaveLength(2);
      const firstResult = requireDefined(results[0], "Expected first load result");
      const secondResult = requireDefined(results[1], "Expected second load result");
      expect(firstResult.success).toBe(true);
      expect(firstResult.dataUrl).toBe("data:image/jpeg;base64,abc123");
      expect(secondResult.success).toBe(true);
    });

    it("should return results for all URLs even with failures", async () => {
      // One valid local URL, one invalid
      mockStorage.extractKeyFromUrl.mockReturnValueOnce("key.jpg").mockReturnValueOnce(null);
      mockStorage.download.mockResolvedValueOnce(Buffer.from("fake"));

      const urls = ["/api/uploads/key.jpg", "/api/uploads/invalid"];

      const results = await loadImagesForAI(urls);

      expect(results).toHaveLength(2);
      const firstResult = requireDefined(results[0], "Expected first load result");
      const secondResult = requireDefined(results[1], "Expected second load result");
      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toBeDefined();
    });
  });

  describe("loadImagesForAIOrThrow", () => {
    it("should return data URLs when all succeed", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValueOnce("key1.jpg").mockReturnValueOnce("key2.jpg");
      mockStorage.download
        .mockResolvedValueOnce(Buffer.from("fake-image-1"))
        .mockResolvedValueOnce(Buffer.from("fake-image-2"));

      const results = await loadImagesForAIOrThrow([
        "/api/uploads/key1.jpg",
        "/api/uploads/key2.jpg",
      ]);

      expect(results).toHaveLength(2);
      const firstResult = requireDefined(results[0], "Expected first data URL result");
      const secondResult = requireDefined(results[1], "Expected second data URL result");
      expect(firstResult).toMatch(/^data:image\/jpeg;/);
      expect(secondResult).toMatch(/^data:image\/jpeg;/);
    });

    it("should handle mixed base64 and local URLs", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValue("key.jpg");
      mockStorage.download.mockResolvedValue(Buffer.from("fake-image"));

      const results = await loadImagesForAIOrThrow([
        "data:image/jpeg;base64,abc123",
        "/api/uploads/key.jpg",
      ]);

      expect(results).toHaveLength(2);
      const firstResult = requireDefined(results[0], "Expected first data URL result");
      const secondResult = requireDefined(results[1], "Expected second data URL result");
      expect(firstResult).toBe("data:image/jpeg;base64,abc123");
      expect(secondResult).toMatch(/^data:image\/jpeg;/);
    });

    it("should throw when any image fails to load", async () => {
      mockStorage.extractKeyFromUrl.mockReturnValue(null);

      const urls = ["/api/uploads/invalid1", "/api/uploads/invalid2"];

      await expect(loadImagesForAIOrThrow(urls)).rejects.toThrow("Failed to load 2 image(s)");
    });
  });

  describe("inferImageMimeType", () => {
    it("should infer jpeg from jpg extension", () => {
      expect(inferImageMimeType("https://example.com/image.jpg")).toBe("image/jpeg");
      expect(inferImageMimeType("https://example.com/image.jpeg")).toBe("image/jpeg");
    });

    it("should infer png from png extension", () => {
      expect(inferImageMimeType("https://example.com/image.png")).toBe("image/png");
    });

    it("should infer webp from webp extension", () => {
      expect(inferImageMimeType("https://example.com/image.webp")).toBe("image/webp");
    });

    it("should infer gif from gif extension", () => {
      expect(inferImageMimeType("https://example.com/image.gif")).toBe("image/gif");
    });

    it("should infer heic from heic extension", () => {
      expect(inferImageMimeType("https://example.com/image.heic")).toBe("image/heic");
    });

    it("should infer heif from heif extension", () => {
      expect(inferImageMimeType("https://example.com/image.heif")).toBe("image/heif");
    });

    it("should infer avif from avif extension", () => {
      expect(inferImageMimeType("https://example.com/image.avif")).toBe("image/avif");
    });

    it("should default to jpeg for unknown extensions", () => {
      expect(inferImageMimeType("https://example.com/image.bmp")).toBe("image/jpeg");
      expect(inferImageMimeType("https://example.com/image.unknown")).toBe("image/jpeg");
      expect(inferImageMimeType("https://example.com/image")).toBe("image/jpeg");
    });

    it("should handle URLs with query parameters", () => {
      expect(inferImageMimeType("https://example.com/image.jpg?w=800&h=600")).toBe("image/jpeg");
      expect(inferImageMimeType("https://example.com/image.png?token=abc123")).toBe("image/png");
    });

    it("should handle R2 URLs", () => {
      expect(inferImageMimeType("https://bucket.r2.dev/ledger-123/doc-456/image.jpg")).toBe(
        "image/jpeg"
      );
      expect(inferImageMimeType("https://bucket.r2.cloudflarestorage.com/key.png")).toBe(
        "image/png"
      );
    });

    it("should handle local file paths", () => {
      expect(inferImageMimeType("/path/to/image.jpg")).toBe("image/jpeg");
      expect(inferImageMimeType("./relative/path/image.png")).toBe("image/png");
    });
  });
});
