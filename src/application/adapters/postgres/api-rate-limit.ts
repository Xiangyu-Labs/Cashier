/**
 * Postgres-backed fixed-window rate limiter.
 *
 * Provides cross-instance rate limiting using atomic INSERT ... ON CONFLICT
 * increment pattern in a dedicated rate_limit_buckets table.
 */

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { RateLimiterPort, RateLimitResult } from "@/application/contracts";

class PostgresRateLimiter implements RateLimiterPort {
  /**
   * Atomically increment the counter for a bucket key.
   *
   * Creates a new bucket row if none exists, otherwise increments the count
   * if still within the same time window. Resets the count and window if the
   * window has expired.
   *
   * @param bucketKey - Unique key identifying the rate-limit bucket
   * @param limit     - Maximum number of requests allowed per window
   * @param windowSeconds - Time window in seconds
   */
  async increment(
    bucketKey: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const windowStartDate = new Date(windowStart * 1000);

    const result = await db.execute<{
      curr_count: number;
      window_start: Date;
    }>(sql`
      INSERT INTO rate_limit_buckets (bucket_key, count, window_start, created_at)
      VALUES (${bucketKey}, 1, ${windowStartDate}, NOW())
      ON CONFLICT (bucket_key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_buckets.window_start = ${windowStartDate}
            THEN rate_limit_buckets.count + 1
          ELSE 1
        END,
        window_start = CASE
          WHEN rate_limit_buckets.window_start = ${windowStartDate}
            THEN rate_limit_buckets.window_start
          ELSE ${windowStartDate}
        END
      RETURNING count AS curr_count, window_start
    `);

    const row = result.rows?.[0];
    if (row == null) {
      // Fallback: should not happen with RETURNING
      return {
        success: true,
        remaining: limit - 1,
        resetTime: (windowStart + windowSeconds) * 1000,
      };
    }

    const currCount = Number(row.curr_count);
    const resetTime = (windowStart + windowSeconds) * 1000;

    return {
      success: currCount <= limit,
      remaining: Math.max(0, limit - currCount),
      resetTime,
    };
  }

  async releaseIncrement(
    bucketKey: string,
    windowSeconds: number,
    resetTime: number
  ): Promise<void> {
    const windowStart = new Date(resetTime - windowSeconds * 1000);
    await db.execute(sql`
      UPDATE rate_limit_buckets
      SET count = GREATEST(0, count - 1)
      WHERE bucket_key = ${bucketKey}
        AND window_start = ${windowStart}
        AND count > 0
    `);
  }

  /**
   * Read the counter for the current fixed window without incrementing.
   *
   * Returns 0 when the bucket is missing or its stored window has already
   * expired, so callers can pre-check a bucket without mutating state.
   *
   * @param bucketKey - Unique key identifying the rate-limit bucket
   * @param windowSeconds - Time window in seconds
   */
  async current(bucketKey: string, windowSeconds: number): Promise<number> {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const result = await db.execute<{ curr_count: number }>(sql`
      SELECT count AS curr_count
      FROM rate_limit_buckets
      WHERE bucket_key = ${bucketKey}
        AND window_start = ${new Date(windowStart * 1000)}
    `);
    const row = result.rows?.[0];
    return row == null ? 0 : Number(row.curr_count);
  }

  async acquireCooldown(bucketKey: string, seconds: number) {
    const result = await db.execute<{ window_start: Date }>(sql`
      INSERT INTO rate_limit_buckets (bucket_key, count, window_start, created_at)
      VALUES (${bucketKey}, 1, date_trunc('milliseconds', NOW()), NOW())
      ON CONFLICT (bucket_key) DO UPDATE SET
        count = 1,
        window_start = date_trunc('milliseconds', NOW())
      WHERE rate_limit_buckets.window_start <= NOW() - ${seconds} * INTERVAL '1 second'
      RETURNING window_start
    `);
    const acquiredAt = result.rows?.[0]?.window_start;
    if (acquiredAt != null) {
      return { acquired: true, acquiredAt: new Date(acquiredAt), retryAfter: 0 };
    }

    const existing = await db.execute<{ window_start: Date; retry_after: number }>(sql`
      SELECT window_start,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
          window_start + ${seconds} * INTERVAL '1 second' - NOW()
        ))))::integer AS retry_after
      FROM rate_limit_buckets
      WHERE bucket_key = ${bucketKey}
    `);
    const row = existing.rows?.[0];
    return {
      acquired: false,
      acquiredAt: row?.window_start == null ? new Date() : new Date(row.window_start),
      retryAfter: row?.retry_after == null ? seconds : Number(row.retry_after),
    };
  }

  async releaseCooldown(bucketKey: string, acquiredAt: Date): Promise<boolean> {
    const result = await db.execute(sql`
      DELETE FROM rate_limit_buckets
      WHERE bucket_key = ${bucketKey}
        AND window_start = ${acquiredAt}
      RETURNING bucket_key
    `);
    return (result.rows?.length ?? 0) === 1;
  }

  /**
   * Activate a cooldown for a bucket key.
   *
   * Sets count=1 and window_start=NOW, replacing any existing value.
   * Cooldown duration is measured from the activation time.
   *
   * @param bucketKey - Unique key identifying the bucket
   * @param _cooldownSeconds - Cooldown duration in seconds (used only for
   *   context; the bucket stores activation time, not the duration)
   */
  async setCooldown(bucketKey: string, _cooldownSeconds: number): Promise<void> {
    const now = new Date();
    await db.execute(sql`
      INSERT INTO rate_limit_buckets (bucket_key, count, window_start, created_at)
      VALUES (${bucketKey}, 1, ${now}, NOW())
      ON CONFLICT (bucket_key) DO UPDATE SET
        count = 1,
        window_start = ${now}
    `);
  }

  /**
   * Return remaining seconds for an active cooldown.
   *
   * Reads the bucket's window_start and computes:
   *   remaining = max(0, cooldownSeconds - elapsed_seconds)
   *
   * @param bucketKey - Unique key identifying the bucket
   * @param cooldownSeconds - Cooldown duration in seconds
   * @returns Remaining seconds (0 if expired or no bucket exists)
   */
  async getCooldownRemaining(bucketKey: string, cooldownSeconds: number): Promise<number> {
    const result = await db.execute<{ window_start: Date }>(sql`
      SELECT window_start FROM rate_limit_buckets WHERE bucket_key = ${bucketKey}
    `);

    const row = result.rows?.[0];
    if (row == null) {
      return 0;
    }

    const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
    return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
  }
}

/** Singleton Postgres-backed rate limiter for API v1 cross-instance limiting. */
export const postgresRateLimiter = new PostgresRateLimiter();
