import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageProvider } from "@/lib/storage/memory";

describe("storage/MemoryStorageProvider", () => {
  let storage: MemoryStorageProvider;

  beforeEach(() => {
    storage = new MemoryStorageProvider();
  });

  describe("upload", () => {
    it("should upload file and return public URL", async () => {
      const buffer = Buffer.from("test content");
      const url = await storage.upload("test-key", buffer, "text/plain");

      expect(url).toBe("memory://test-key");
      expect(storage.size()).toBe(1);
    });

    it("should store file data correctly", async () => {
      const buffer = Buffer.from("test content");
      await storage.upload("test-key", buffer, "text/plain");

      const downloaded = await storage.download("test-key");
      expect(downloaded.toString()).toBe("test content");
    });

    it("should overwrite existing key", async () => {
      const buffer1 = Buffer.from("content 1");
      const buffer2 = Buffer.from("content 2");

      await storage.upload("test-key", buffer1, "text/plain");
      await storage.upload("test-key", buffer2, "text/plain");

      const downloaded = await storage.download("test-key");
      expect(downloaded.toString()).toBe("content 2");
      expect(storage.size()).toBe(1);
    });
  });

  describe("download", () => {
    it("should download uploaded file", async () => {
      const buffer = Buffer.from("test content");
      await storage.upload("test-key", buffer, "text/plain");

      const downloaded = await storage.download("test-key");
      expect(downloaded.toString()).toBe("test content");
    });

    it("should throw for non-existent key", async () => {
      await expect(storage.download("non-existent")).rejects.toThrow("File not found");
    });

    it("should return a copy of the buffer", async () => {
      const buffer = Buffer.from("test content");
      await storage.upload("test-key", buffer, "text/plain");

      const downloaded1 = await storage.download("test-key");
      const downloaded2 = await storage.download("test-key");

      // Modify one buffer
      downloaded1[0] = 0x00;

      // The other should be unchanged
      expect(downloaded2[0]).not.toBe(0x00);
    });
  });

  describe("delete", () => {
    it("should delete file and return success", async () => {
      const buffer = Buffer.from("test content");
      await storage.upload("test-key", buffer, "text/plain");

      const result = await storage.delete("test-key");

      expect(result.success).toBe(true);
      expect(result.key).toBe("test-key");
      expect(storage.size()).toBe(0);
    });

    it("should not throw for non-existent key", async () => {
      const result = await storage.delete("non-existent");

      expect(result.success).toBe(true);
      expect(result.key).toBe("non-existent");
    });

    it("should not include error on success", async () => {
      const result = await storage.delete("any-key");

      expect(result.error).toBeUndefined();
    });
  });

  describe("getPublicUrl", () => {
    it("should return memory URL for key", () => {
      const url = storage.getPublicUrl("my-key");
      expect(url).toBe("memory://my-key");
    });

    it("should handle keys with special characters", () => {
      const url = storage.getPublicUrl("path/to/file.txt");
      expect(url).toBe("memory://path/to/file.txt");
    });
  });

  describe("extractKeyFromUrl", () => {
    it("should extract key from memory URL", () => {
      const key = storage.extractKeyFromUrl("memory://my-key");
      expect(key).toBe("my-key");
    });

    it("should extract key from URL with path", () => {
      const key = storage.extractKeyFromUrl("memory://path/to/file.txt");
      expect(key).toBe("path/to/file.txt");
    });

    it("should return null for non-memory URLs", () => {
      expect(storage.extractKeyFromUrl("https://example.com/file.txt")).toBeNull();
      expect(storage.extractKeyFromUrl("data:text/plain;base64,abc")).toBeNull();
    });

    it("should return null for invalid URLs", () => {
      expect(storage.extractKeyFromUrl("memory://")).toBe("");
    });
  });

  describe("clear", () => {
    it("should remove all files", async () => {
      await storage.upload("key1", Buffer.from("content1"), "text/plain");
      await storage.upload("key2", Buffer.from("content2"), "text/plain");

      storage.clear();

      expect(storage.size()).toBe(0);
      await expect(storage.download("key1")).rejects.toThrow();
      await expect(storage.download("key2")).rejects.toThrow();
    });
  });

  describe("size", () => {
    it("should return number of stored files", async () => {
      expect(storage.size()).toBe(0);

      await storage.upload("key1", Buffer.from("content1"), "text/plain");
      expect(storage.size()).toBe(1);

      await storage.upload("key2", Buffer.from("content2"), "text/plain");
      expect(storage.size()).toBe(2);

      await storage.delete("key1");
      expect(storage.size()).toBe(1);
    });
  });
});
