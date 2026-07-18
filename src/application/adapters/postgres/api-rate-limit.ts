/**
 * Postgres-backed fixed-window rate limiter.
 *
 * Provides cross-instance rate limiting using atomic INSERT ... ON CONFLICT
 * increment pattern in a dedicated rate_limit_buckets table.
 */

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp in milliseconds
}

class PostgresRateLimiter {
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
      return { success: true, remaining: limit - 1, resetTime: (windowStart + windowSeconds) * 1000 };
    }

    const currCount = Number(row.curr_count);
    const resetTime = (windowStart + windowSeconds) * 1000;

    return {
      success: currCount <= limit,
      remaining: Math.max(0, limit - currCount),
      resetTime,
    };
  }
}

/** Singleton Postgres-backed rate limiter for API v1 cross-instance limiting. */
export const postgresRateLimiter = new PostgresRateLimiter();
