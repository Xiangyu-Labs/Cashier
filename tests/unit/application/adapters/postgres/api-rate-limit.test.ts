import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
});
