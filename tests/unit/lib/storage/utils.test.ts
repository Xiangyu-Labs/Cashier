import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    loadImageForAI,
    loadImagesForAI,
    loadImagesForAIOrThrow,
    needsLoading,
} from "@/lib/storage/utils";
import * as r2Module from "@/lib/storage/r2";

// Mock the R2 module
vi.mock("@/lib/storage/r2", () => ({
    isR2Enabled: vi.fn(),
    getR2Storage: vi.fn(),
}));

describe("storage/utils", () => {
    const mockStorage = {
        extractKeyFromUrl: vi.fn(),
        download: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(r2Module.isR2Enabled).mockReturnValue(false);
        vi.mocked(r2Module.getR2Storage).mockReturnValue(mockStorage as unknown as ReturnType<typeof r2Module.getR2Storage>);
        process.env.R2_PUBLIC_URL = "";
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

        it("should download from R2 when R2 is enabled and URL matches", async () => {
            vi.mocked(r2Module.isR2Enabled).mockReturnValue(true);
            mockStorage.extractKeyFromUrl.mockReturnValue("test-key");
            mockStorage.download.mockResolvedValue(Buffer.from("fake-image-data"));

            const result = await loadImageForAI("https://bucket.r2.dev/test-key.jpg");

            expect(mockStorage.extractKeyFromUrl).toHaveBeenCalledWith("https://bucket.r2.dev/test-key.jpg");
            expect(mockStorage.download).toHaveBeenCalledWith("test-key");
            expect(result).toBe("data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh");
        });

        it("should use correct MIME type based on file extension", async () => {
            vi.mocked(r2Module.isR2Enabled).mockReturnValue(true);
            mockStorage.extractKeyFromUrl.mockReturnValue("test-key");
            mockStorage.download.mockResolvedValue(Buffer.from("fake"));

            // PNG extension
            mockStorage.extractKeyFromUrl.mockReturnValue("key.png");
            let result = await loadImageForAI("https://bucket.r2.dev/key.png");
            expect(result).toMatch(/^data:image\/png;/);

            // WebP extension
            mockStorage.extractKeyFromUrl.mockReturnValue("key.webp");
            result = await loadImageForAI("https://bucket.r2.dev/key.webp");
            expect(result).toMatch(/^data:image\/webp;/);
        });

        it("should reject internal IP addresses (SSRF protection)", async () => {
            await expect(loadImageForAI("http://localhost/image.jpg")).rejects.toThrow("not allowed");
            await expect(loadImageForAI("http://127.0.0.1/image.jpg")).rejects.toThrow("not allowed");
            await expect(loadImageForAI("http://192.168.1.1/image.jpg")).rejects.toThrow("not allowed");
            await expect(loadImageForAI("http://10.0.0.1/image.jpg")).rejects.toThrow("not allowed");
            await expect(loadImageForAI("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("not allowed");
        });

        it("should reject non-whitelisted hostnames", async () => {
            await expect(loadImageForAI("https://example.com/image.jpg")).rejects.toThrow("Hostname not in allowlist");
            await expect(loadImageForAI("https://attacker.com/malicious")).rejects.toThrow("Hostname not in allowlist");
        });

        it("should allow R2 hostnames", async () => {
            // Mock fetch for R2 URLs when R2 is not enabled locally
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ "content-type": "image/jpeg" }),
                arrayBuffer: async () => new ArrayBuffer(10),
            });

            // This should work (with mocked fetch) - just verify it doesn't throw for hostname
            const result = await loadImageForAI("https://bucket.r2.cloudflarestorage.com/key");
            expect(result).toMatch(/^data:image/);
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
            // One valid base64, one that will fail (internal IP)
            const urls = [
                "data:image/jpeg;base64,/9j/4AAQ...",
                "http://localhost/forbidden.jpg",
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
                "http://localhost/forbidden.jpg",
            ];

            await expect(loadImagesForAIOrThrow(urls)).rejects.toThrow("Failed to load 1 image(s)");
        });
    });
});
