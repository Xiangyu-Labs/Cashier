/**
 * Rate Limiting Utilities
 *
 * Provides in-memory rate limiting for API endpoints.
 * For production use with multiple instances, consider using Redis-based solution
 * like @upstash/ratelimit.
 */

import { memoryStore } from "@/lib/memory-store";
import { logger } from "@/lib/logger";

// Warn about multi-instance deployment limitations
if (process.env.NODE_ENV === "production") {
    logger.warn(
        "Using in-memory rate limit store. This implementation does not share state between server instances. " +
        "If you are running multiple instances behind a load balancer, rate limits may not work correctly. " +
        "Consider using Redis or a database-backed rate limiter for multi-instance deployments."
    );
}

/**
 * Rate Limiting Utilities
 *
 * Provides in-memory rate limiting for API endpoints.
 * Replaces previous Redis-based implementation.
 */

class MemoryRateLimiter {
    /**
     * Check if a request should be rate limited
     * Uses a Fixed Window algorithm backed by in-memory store.
     *
     * @param key - Unique identifier (e.g., "share_abc123_192.168.1.1")
     * @param limit - Maximum number of requests allowed
     * @param windowMs - Time window in milliseconds
     * @returns { success: boolean, remaining: number, resetTime: number }
     */
    async limit(key: string, limit: number, windowMs: number): Promise<{
        success: boolean;
        remaining: number;
        resetTime: number;
    }> {
        const store = memoryStore;
        const rKey = `ratelimit:${key}`;
        const windowSeconds = Math.ceil(windowMs / 1000);

        const attempts = await store.incr(rKey);

        // If it's the first attempt, set the expiry
        if (attempts === 1) {
            await store.expire(rKey, windowSeconds);
        }

        const ttl = await store.ttl(rKey);

        // Calculate reset time
        const effectiveTtl = ttl > 0 ? ttl : windowSeconds;
        const resetTime = Date.now() + (effectiveTtl * 1000);

        if (attempts > limit) {
            return {
                success: false,
                remaining: 0,
                resetTime,
            };
        }

        return {
            success: true,
            remaining: Math.max(0, limit - attempts),
            resetTime,
        };
    }

    destroy() {
        // No-op
    }
}

// Create a singleton instance
const rateLimiter = new MemoryRateLimiter();

/**
 * Rate limit configurations for different endpoints
 */
export const RateLimitConfig = {
    // API v1: 20 requests per minute per API key
    API_V1: {
        limit: 20,
        windowMs: 60 * 1000,
    },
} as const;

/**
 * Apply rate limiting to an API v1 request
 * @param apiKey - The API key being used
 */
export async function rateLimitApiV1(apiKey: string) {
    const key = `api_v1_${apiKey}`;
    return rateLimiter.limit(
        key,
        RateLimitConfig.API_V1.limit,
        RateLimitConfig.API_V1.windowMs
    );
}

/**
 * Generic rate limiter for custom use cases
 */
export async function rateLimit(
    identifier: string,
    limit: number,
    windowMs: number
) {
    return rateLimiter.limit(identifier, limit, windowMs);
}

// Export the singleton for testing purposes
export { rateLimiter };
