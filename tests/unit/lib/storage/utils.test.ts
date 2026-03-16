import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    loadImageForAI,
    loadImagesForAI,
    loadImagesForAIOrThrow,
    needsLoading,
    inferImageMimeType,
} from "@/lib/storage/utils";
import * as localModule from "@/lib/storage/local";

// Mock the local storage module
vi.mock("@/lib/storage/local", () => ({
    getLocalStorage: vi.fn(),
}));

describe("storage/utils", () => {
    const mockStorage = {
        extractKeyFromUrl: vi.fn(),
        download: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(localModule.getLocalStorage).mockReturnValue(mockStorage as unknown as ReturnType<typeof localModule.getLocalStorage>);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe("needsLoading", () => {
        it("should return true for HTTP URLs", () => {
            expect(needsLoading("https://example.com/image.jpg")).toBe(true);
            expect(needsLoading("http://localhost:3000/image.png")).toBe(true);
        });

        it("should return false for base64 data URLs", () => {
            expect(needsLoading("data:image/jpeg;base64,/9j/4AAQ...")).toBe(false);
        });

        it("should return false for relative URLs", () => {
            expect(needsLoading("/images/photo.jpg")).toBe(false);
        });
    });

    describe("loadImageForAI", () => {
        it("should return base64 data URL as-is", async () => {
            const dataUrl = "data:image/jpeg;base64,/9j/4AAQ...";
            const result = await loadImageForAI(dataUrl);
            expect(result).toBe(dataUrl);
        });

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

            await expect(loadImageForAI("/api/uploads/invalid")).rejects.toThrow("Invalid local upload URL");
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

        it("should fetch external HTTP URLs directly", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ "content-type": "image/jpeg" }),
                arrayBuffer: async () => new ArrayBuffer(10),
            });

            const result = await loadImageForAI("https://example.com/image.jpg");

            expect(global.fetch).toHaveBeenCalledWith("https://example.com/image.jpg", {
                headers: { "User-Agent": "Cashier-App/1.0" },
            });
            expect(result).toMatch(/^data:image\/jpeg;/);
        });

        it("should throw on HTTP error for external URLs", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            await expect(loadImageForAI("https://example.com/notfound.jpg")).rejects.toThrow("HTTP error: 404");
        });

        it("should infer mime type from URL when server returns application/octet-stream", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ "content-type": "application/octet-stream" }),
                arrayBuffer: async () => new ArrayBuffer(10),
            });

            const result = await loadImageForAI("https://example.com/image.png");
            expect(result).toMatch(/^data:application\/octet-stream;/);
        });

        it("should use server content-type when available", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ "content-type": "image/png" }),
                arrayBuffer: async () => new ArrayBuffer(10),
            });

            const result = await loadImageForAI("https://example.com/image.jpg");
            // Should use server's content-type (image/png) not the one from extension
            expect(result).toMatch(/^data:image\/png;/);
        });
    });

    describe("loadImagesForAI", () => {
        it("should load multiple images with partial failure handling", async () => {
            const dataUrl = "data:image/jpeg;base64,/9j/4AAQ...";

            const results = await loadImagesForAI([dataUrl, dataUrl]);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it("should return results for all URLs even with failures", async () => {
            // One valid base64, one that will fail (unsupported URL)
            const urls = [
                "data:image/jpeg;base64,/9j/4AAQ...",
                "ftp://invalid-protocol.com/image.jpg",
            ];

            const results = await loadImagesForAI(urls);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[1].error).toBeDefined();
        });
    });

    describe("loadImagesForAIOrThrow", () => {
        it("should return data URLs when all succeed", async () => {
            const dataUrl = "data:image/jpeg;base64,/9j/4AAQ...";

            const results = await loadImagesForAIOrThrow([dataUrl, dataUrl]);

            expect(results).toHaveLength(2);
            expect(results[0]).toBe(dataUrl);
            expect(results[1]).toBe(dataUrl);
        });

        it("should throw when any image fails to load", async () => {
            const urls = [
                "data:image/jpeg;base64,/9j/4AAQ...",
                "ftp://invalid-protocol.com/image.jpg",
            ];

            await expect(loadImagesForAIOrThrow(urls)).rejects.toThrow("Failed to load 1 image(s)");
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
            expect(inferImageMimeType("https://bucket.r2.dev/ledger-123/doc-456/image.jpg")).toBe("image/jpeg");
            expect(inferImageMimeType("https://bucket.r2.cloudflarestorage.com/key.png")).toBe("image/png");
        });

        it("should handle local file paths", () => {
            expect(inferImageMimeType("/path/to/image.jpg")).toBe("image/jpeg");
            expect(inferImageMimeType("./relative/path/image.png")).toBe("image/png");
        });
    });
});
