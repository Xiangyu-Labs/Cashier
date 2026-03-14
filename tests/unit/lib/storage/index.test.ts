import { describe, it, expect } from "vitest";
import {
    isBase64Url,
    isHttpUrl,
    base64ToBuffer,
    bufferToBase64,
} from "@/lib/storage";

describe("storage/index", () => {
    describe("isBase64Url", () => {
        it("should return true for base64 data URLs", () => {
            expect(isBase64Url("data:image/jpeg;base64,/9j/4AAQ...")).toBe(true);
            expect(isBase64Url("data:image/png;base64,iVBORw0KG...")).toBe(true);
        });

        it("should return false for HTTP URLs", () => {
            expect(isBase64Url("https://example.com/image.jpg")).toBe(false);
            expect(isBase64Url("http://localhost:3000/image.png")).toBe(false);
        });

        it("should return false for relative URLs", () => {
            expect(isBase64Url("/images/photo.jpg")).toBe(false);
            expect(isBase64Url("images/photo.png")).toBe(false);
        });
    });

    describe("isHttpUrl", () => {
        it("should return true for HTTP URLs", () => {
            expect(isHttpUrl("http://example.com/image.jpg")).toBe(true);
            expect(isHttpUrl("https://example.com/image.png")).toBe(true);
            expect(isHttpUrl("https://bucket.r2.cloudflarestorage.com/key")).toBe(true);
        });

        it("should return false for base64 data URLs", () => {
            expect(isHttpUrl("data:image/jpeg;base64,/9j/4AAQ...")).toBe(false);
        });

        it("should return false for relative URLs", () => {
            expect(isHttpUrl("/images/photo.jpg")).toBe(false);
        });

        it("should return false for memory URLs", () => {
            expect(isHttpUrl("memory://test-key")).toBe(false);
        });
    });

    describe("base64ToBuffer", () => {
        it("should convert base64 data URL to buffer and mime type", () => {
            const base64Data = "SGVsbG8gV29ybGQh"; // "Hello World!"
            const dataUrl = `data:text/plain;base64,${base64Data}`;

            const result = base64ToBuffer(dataUrl);

            expect(result.mimeType).toBe("text/plain");
            expect(result.buffer.toString()).toBe("Hello World!");
        });

        it("should handle image data URLs", () => {
            // Small 1x1 PNG pixel
            const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
            const dataUrl = `data:image/png;base64,${pngBase64}`;

            const result = base64ToBuffer(dataUrl);

            expect(result.mimeType).toBe("image/png");
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(result.buffer.length).toBeGreaterThan(0);
        });

        it("should throw for invalid data URLs", () => {
            expect(() => base64ToBuffer("not-a-data-url")).toThrow("Invalid base64 data URL");
            expect(() => base64ToBuffer("data:image/png,not-base64")).toThrow("Invalid base64 data URL");
        });
    });

    describe("bufferToBase64", () => {
        it("should convert buffer to base64 data URL", () => {
            const buffer = Buffer.from("Hello World!");
            const mimeType = "text/plain";

            const result = bufferToBase64(buffer, mimeType);

            expect(result).toBe("data:text/plain;base64,SGVsbG8gV29ybGQh");
        });

        it("should handle image buffers", () => {
            const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
            const mimeType = "image/png";

            const result = bufferToBase64(buffer, mimeType);

            expect(result).toMatch(/^data:image\/png;base64,/);
        });
    });
});
