import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { memoryStore } from "@/lib/memory-store";

describe("memoryStore", () => {
  beforeEach(async () => {
    await memoryStore.flushall();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("incr", () => {
    it("increments non-existent key to 1", async () => {
      const result = await memoryStore.incr("counter");
      expect(result).toBe(1);
    });

    it("increments existing key", async () => {
      await memoryStore.incr("counter");
      await memoryStore.incr("counter");
      const result = await memoryStore.incr("counter");
      expect(result).toBe(3);
    });

    it("preserves existing TTL on increment", async () => {
      await memoryStore.setex("counter", 100, "5");
      await memoryStore.incr("counter");
      const ttl = await memoryStore.ttl("counter");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });
  });

  describe("setex", () => {
    it("sets value with expiration", async () => {
      await memoryStore.setex("key", 60, "value");
      const result = await memoryStore.get("key");
      expect(result).toBe("value");
    });

    it("overwrites existing value", async () => {
      await memoryStore.setex("key", 60, "old");
      await memoryStore.setex("key", 60, "new");
      const result = await memoryStore.get("key");
      expect(result).toBe("new");
    });
  });

  describe("get", () => {
    it("returns null for non-existent key", async () => {
      const result = await memoryStore.get("missing");
      expect(result).toBeNull();
    });

    it("returns value for existing key", async () => {
      await memoryStore.setex("key", 60, "value");
      const result = await memoryStore.get("key");
      expect(result).toBe("value");
    });

    it("returns null for expired key", async () => {
      vi.useFakeTimers();
      await memoryStore.setex("key", 1, "value");
      vi.advanceTimersByTime(2000); // 2 seconds
      const result = await memoryStore.get("key");
      expect(result).toBeNull();
    });
  });

  describe("expire", () => {
    it("sets expiration on existing key", async () => {
      await memoryStore.setex("key", 60, "value");
      await memoryStore.expire("key", 10);
      const ttl = await memoryStore.ttl("key");
      expect(ttl).toBeLessThanOrEqual(10);
      expect(ttl).toBeGreaterThan(0);
    });

    it("does nothing for non-existent key", async () => {
      // Should not throw
      await memoryStore.expire("missing", 10);
      const ttl = await memoryStore.ttl("missing");
      expect(ttl).toBe(-2);
    });
  });

  describe("ttl", () => {
    it("returns -2 for non-existent key", async () => {
      const result = await memoryStore.ttl("missing");
      expect(result).toBe(-2);
    });

    it("returns -1 for key without expiry", async () => {
      // incr creates a key without expiry
      await memoryStore.incr("counter");
      const result = await memoryStore.ttl("counter");
      expect(result).toBe(-1);
    });

    it("returns remaining seconds for key with expiry", async () => {
      await memoryStore.setex("key", 60, "value");
      const result = await memoryStore.ttl("key");
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(60);
    });

    it("returns -2 and deletes expired key", async () => {
      vi.useFakeTimers();
      await memoryStore.setex("key", 1, "value");
      vi.advanceTimersByTime(2000);
      const result = await memoryStore.ttl("key");
      expect(result).toBe(-2);
    });
  });

  describe("flushall", () => {
    it("clears all data", async () => {
      await memoryStore.setex("key1", 60, "value1");
      await memoryStore.setex("key2", 60, "value2");
      await memoryStore.flushall();
      expect(await memoryStore.get("key1")).toBeNull();
      expect(await memoryStore.get("key2")).toBeNull();
    });
  });
});
