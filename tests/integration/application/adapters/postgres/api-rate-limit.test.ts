import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("PostgresRateLimiter", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:00:00.000Z"));
    await db.execute(sql`DELETE FROM rate_limit_buckets`);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    vi.advanceTimersByTime(1100);

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

  it("current() returns the count of the current window", async () => {
    await postgresRateLimiter.increment("test-current-live", 10, 60);
    await postgresRateLimiter.increment("test-current-live", 10, 60);
    await postgresRateLimiter.increment("test-current-live", 10, 60);

    expect(await postgresRateLimiter.current("test-current-live", 60)).toBe(3);
  });

  it("current() returns 0 for a missing bucket", async () => {
    expect(await postgresRateLimiter.current("test-current-missing", 60)).toBe(0);
  });

  it("current() returns 0 once the window has expired", async () => {
    await postgresRateLimiter.increment("test-current-expired", 10, 1);
    expect(await postgresRateLimiter.current("test-current-expired", 1)).toBe(1);

    vi.advanceTimersByTime(1100);
    expect(await postgresRateLimiter.current("test-current-expired", 1)).toBe(0);
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
    it("grants exactly one lease to concurrent callers", async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => postgresRateLimiter.acquireCooldown("cd-concurrent", 60))
      );

      expect(results.filter((result) => result.acquired)).toHaveLength(1);
      expect(results.filter((result) => !result.acquired)).toHaveLength(7);
    });

    it("releases only the matching lease timestamp", async () => {
      const lease = await postgresRateLimiter.acquireCooldown("cd-release-cas", 60);
      expect(lease.acquired).toBe(true);

      await expect(
        postgresRateLimiter.releaseCooldown(
          "cd-release-cas",
          new Date(lease.acquiredAt.getTime() + 1)
        )
      ).resolves.toBe(false);
      await expect(
        postgresRateLimiter.acquireCooldown("cd-release-cas", 60)
      ).resolves.toMatchObject({ acquired: false });
      await expect(
        postgresRateLimiter.releaseCooldown("cd-release-cas", lease.acquiredAt)
      ).resolves.toBe(true);
      await expect(
        postgresRateLimiter.acquireCooldown("cd-release-cas", 60)
      ).resolves.toMatchObject({ acquired: true });
    });

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
      vi.advanceTimersByTime(1100);

      const remaining = await postgresRateLimiter.getCooldownRemaining(key, 1);
      expect(remaining).toBe(0);
    });

    it("setCooldown refreshes an existing cooldown window", async () => {
      const key = "cd-refresh";

      await postgresRateLimiter.setCooldown(key, 60);
      const before = await postgresRateLimiter.getCooldownRemaining(key, 60);
      expect(before).toBeGreaterThan(0);

      // Wait briefly, then set cooldown again
      vi.advanceTimersByTime(200);
      await postgresRateLimiter.setCooldown(key, 60);

      // After refresh, remaining should be closer to 60 than before the wait
      const after = await postgresRateLimiter.getCooldownRemaining(key, 60);
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });
});
