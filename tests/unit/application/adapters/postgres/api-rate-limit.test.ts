import { describe, it, expect, beforeEach } from "vitest";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("PostgresRateLimiter", () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM rate_limit_buckets`);
  });

  it("returns success when under limit", async () => {
    const result = await postgresRateLimiter.increment("test-under", 10, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("returns failure when over limit", async () => {
    const bucketKey = "test-over-1";
    const limit = 5;

    for (let i = 0; i < limit; i++) {
      const result = await postgresRateLimiter.increment(bucketKey, limit, 60);
      expect(result.success).toBe(true);
    }

    const over = await postgresRateLimiter.increment(bucketKey, limit, 60);
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("resets count when window expires", async () => {
    const bucketKey = "test-window-reset";

    await postgresRateLimiter.increment(bucketKey, 2, 1);
    await postgresRateLimiter.increment(bucketKey, 2, 1);

    // Within same 1-second window — should be over limit
    const withinWindow = await postgresRateLimiter.increment(bucketKey, 2, 1);
    expect(withinWindow.success).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterReset = await postgresRateLimiter.increment(bucketKey, 2, 1);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });

  it("tracks different bucket keys independently", async () => {
    const limit = 3;

    // Fill bucket-alpha to limit (3 increments)
    let result = await postgresRateLimiter.increment("bucket-alpha", limit, 60);
    expect(result.success).toBe(true);
    result = await postgresRateLimiter.increment("bucket-alpha", limit, 60);
    expect(result.success).toBe(true);
    result = await postgresRateLimiter.increment("bucket-alpha", limit, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);

    // One more should exceed the limit
    result = await postgresRateLimiter.increment("bucket-alpha", limit, 60);
    expect(result.success).toBe(false);

    // bucket-beta should still have all its capacity
    result = await postgresRateLimiter.increment("bucket-beta", limit, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it("handles sequential rapid increments accurately", async () => {
    const bucketKey = "test-rapid";
    const limit = 50;

    for (let i = 0; i < limit; i++) {
      const result = await postgresRateLimiter.increment(bucketKey, limit, 60);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - (i + 1));
    }

    // One more should fail
    const over = await postgresRateLimiter.increment(bucketKey, limit, 60);
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("reports correct remaining count", async () => {
    const bucketKey = "test-remaining";
    const limit = 10;

    const r1 = await postgresRateLimiter.increment(bucketKey, limit, 60);
    expect(r1.remaining).toBe(9);

    const r2 = await postgresRateLimiter.increment(bucketKey, limit, 60);
    expect(r2.remaining).toBe(8);

    // Exhaust
    for (let i = 0; i < 8; i++) {
      await postgresRateLimiter.increment(bucketKey, limit, 60);
    }

    const r3 = await postgresRateLimiter.increment(bucketKey, limit, 60);
    expect(r3.remaining).toBe(0);
    expect(r3.success).toBe(false);
  });

  it("returns a resetTime in the future", async () => {
    const result = await postgresRateLimiter.increment("test-reset-time", 10, 60);
    expect(result.resetTime).toBeGreaterThan(Date.now());
  });

  it("enforces shared limit across concurrent callers", async () => {
    const bucketKey = "test-concurrent";
    const limit = 10;

    // Fire limit+5 concurrent increments and count how many succeed
    const promises = Array.from({ length: limit + 5 }, () =>
      postgresRateLimiter.increment(bucketKey, limit, 60)
    );
    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success).length;
    expect(successes).toBe(limit);
    expect(results.filter((r) => !r.success).length).toBe(5);
  });

  describe("cooldown methods", () => {
    it("setCooldown activates a cooldown", async () => {
      const key = "cd-test-activate";

      await postgresRateLimiter.setCooldown(key, 60);

      const remaining = await postgresRateLimiter.getCooldownRemaining(key, 60);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60);
    });

    it("getCooldownRemaining returns 0 for missing key", async () => {
      const remaining = await postgresRateLimiter.getCooldownRemaining("cd-missing", 60);
      expect(remaining).toBe(0);
    });

    it("getCooldownRemaining returns 0 for expired cooldown", async () => {
      const key = "cd-expired";

      await postgresRateLimiter.setCooldown(key, 1);
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const remaining = await postgresRateLimiter.getCooldownRemaining(key, 1);
      expect(remaining).toBe(0);
    });

    it("setCooldown refreshes an existing cooldown window", async () => {
      const key = "cd-refresh";

      await postgresRateLimiter.setCooldown(key, 60);
      const before = await postgresRateLimiter.getCooldownRemaining(key, 60);
      expect(before).toBeGreaterThan(0);

      // Wait briefly, then set cooldown again
      await new Promise((resolve) => setTimeout(resolve, 200));
      await postgresRateLimiter.setCooldown(key, 60);

      // After refresh, remaining should be closer to 60 than before the wait
      const after = await postgresRateLimiter.getCooldownRemaining(key, 60);
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });
});
