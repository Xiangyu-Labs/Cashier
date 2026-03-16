import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { LocalStorageProvider } from "@/lib/storage/local";

describe("storage/LocalStorageProvider", () => {
    let storage: LocalStorageProvider;
    let tempDir: string;

    beforeEach(async () => {
        // Create a temporary directory for tests
        tempDir = path.join(process.cwd(), "tests", "temp", `local-storage-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });

        // Set the environment variable to use the temp directory
        process.env.LOCAL_STORAGE_PATH = tempDir;

        // Create a new instance with the temp directory
        storage = new LocalStorageProvider();
    });

    afterEach(async () => {
        // Clean up the temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }

        // Reset environment variable
        delete process.env.LOCAL_STORAGE_PATH;
    });

    describe("upload", () => {
        it("should upload file and return correct URL", async () => {
            const buffer = Buffer.from("test content");
            const url = await storage.upload("test-key.txt", buffer, "text/plain");

            expect(url).toBe("/api/uploads/test-key.txt");
        });

        it("should store file data correctly", async () => {
            const buffer = Buffer.from("test content");
            await storage.upload("test-key.txt", buffer, "text/plain");

            const filePath = path.join(tempDir, "test-key.txt");
            const fileContent = await fs.readFile(filePath);
            expect(fileContent.toString()).toBe("test content");
        });

        it("should create nested directories automatically", async () => {
            const buffer = Buffer.from("nested content");
            await storage.upload("path/to/nested/file.txt", buffer, "text/plain");

            const filePath = path.join(tempDir, "path/to/nested/file.txt");
            const fileContent = await fs.readFile(filePath);
            expect(fileContent.toString()).toBe("nested content");
        });

        it("should reject keys with path traversal (..)", async () => {
            const buffer = Buffer.from("test content");

            await expect(storage.upload("../etc/passwd", buffer, "text/plain")).rejects.toThrow(
                "path traversal detected"
            );
        });

        it("should reject keys with backslashes", async () => {
            const buffer = Buffer.from("test content");

            await expect(storage.upload("file\\\\windows.txt", buffer, "text/plain")).rejects.toThrow(
                "backslash detected"
            );
        });

        it("should reject absolute paths", async () => {
            const buffer = Buffer.from("test content");

            await expect(storage.upload("/etc/passwd", buffer, "text/plain")).rejects.toThrow(
                "absolute path detected"
            );
        });

        it("should overwrite existing key", async () => {
            const buffer1 = Buffer.from("content 1");
            const buffer2 = Buffer.from("content 2");

            await storage.upload("test-key.txt", buffer1, "text/plain");
            await storage.upload("test-key.txt", buffer2, "text/plain");

            const filePath = path.join(tempDir, "test-key.txt");
            const fileContent = await fs.readFile(filePath);
            expect(fileContent.toString()).toBe("content 2");
        });
    });

    describe("download", () => {
        it("should download uploaded file", async () => {
            const buffer = Buffer.from("test content");
            await storage.upload("test-key.txt", buffer, "text/plain");

            const downloaded = await storage.download("test-key.txt");
            expect(downloaded.toString()).toBe("test content");
        });

        it("should throw for non-existent key", async () => {
            await expect(storage.download("non-existent.txt")).rejects.toThrow("File not found");
        });

        it("should download from nested path", async () => {
            const buffer = Buffer.from("nested content");
            await storage.upload("deep/nested/path/file.txt", buffer, "text/plain");

            const downloaded = await storage.download("deep/nested/path/file.txt");
            expect(downloaded.toString()).toBe("nested content");
        });
    });

    describe("delete", () => {
        it("should delete file and return success", async () => {
            const buffer = Buffer.from("test content");
            await storage.upload("test-key.txt", buffer, "text/plain");

            const result = await storage.delete("test-key.txt");

            expect(result.success).toBe(true);
            expect(result.key).toBe("test-key.txt");

            // Verify file is deleted
            const filePath = path.join(tempDir, "test-key.txt");
            await expect(fs.access(filePath)).rejects.toThrow();
        });

        it("should return success for non-existent key (idempotent)", async () => {
            const result = await storage.delete("non-existent.txt");

            expect(result.success).toBe(true);
            expect(result.key).toBe("non-existent.txt");
        });

        it("should not include error on success", async () => {
            const buffer = Buffer.from("test content");
            await storage.upload("test-key.txt", buffer, "text/plain");

            const result = await storage.delete("test-key.txt");

            expect(result.error).toBeUndefined();
        });
    });

    describe("getPublicUrl", () => {
        it("should return /api/uploads/ URL for key", () => {
            const url = storage.getPublicUrl("my-key.txt");
            expect(url).toBe("/api/uploads/my-key.txt");
        });

        it("should handle keys with nested paths", () => {
            const url = storage.getPublicUrl("path/to/file.txt");
            expect(url).toBe("/api/uploads/path/to/file.txt");
        });

        it("should remove leading slash from key", () => {
            const url = storage.getPublicUrl("/leading-slash.txt");
            expect(url).toBe("/api/uploads/leading-slash.txt");
        });
    });

    describe("extractKeyFromUrl", () => {
        it("should extract key from /api/uploads/ URL", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/my-key.txt");
            expect(key).toBe("my-key.txt");
        });

        it("should extract key from URL with nested path", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/path/to/file.txt");
            expect(key).toBe("path/to/file.txt");
        });

        it("should return null for non-matching URLs", () => {
            expect(storage.extractKeyFromUrl("https://example.com/file.txt")).toBeNull();
            expect(storage.extractKeyFromUrl("memory://test-key")).toBeNull();
            expect(storage.extractKeyFromUrl("data:text/plain;base64,abc")).toBeNull();
        });

        it("should return null for path traversal attempts", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/../etc/passwd");
            expect(key).toBeNull();
        });

        it("should return null for URLs with backslashes", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/file\\\\windows.txt");
            expect(key).toBeNull();
        });

        it("should strip query parameters", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/file.txt?token=abc123");
            expect(key).toBe("file.txt");
        });

        it("should strip hash fragments", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/file.txt#section");
            expect(key).toBe("file.txt");
        });

        it("should strip both query parameters and hash fragments", () => {
            const key = storage.extractKeyFromUrl("/api/uploads/file.txt?token=abc123#section");
            expect(key).toBe("file.txt");
        });
    });
});
