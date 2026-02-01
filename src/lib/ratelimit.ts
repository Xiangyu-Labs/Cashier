/**
 * Rate Limiting Utilities
 *
 * Provides in-memory rate limiting for API endpoints.
 * For production use with multiple instances, consider using Redis-based solution
 * like @upstash/ratelimit.
 */

import { getRedisConnection } from "@/lib/flow/connection";

/**
 * Rate Limiting Utilities
 *
 * Provides Redis-based rate limiting for API endpoints.
 * Uses the shared IORedis connection from `src/lib/flow/connection.ts`.
 */

class RedisRateLimiter {
    /**
     * Check if a request should be rate limited
     * Uses a Fixed Window algorithm backed by Redis.
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
        const redis = getRedisConnection();
        const rKey = `ratelimit:${key}`;
        const windowSeconds = Math.ceil(windowMs / 1000);

        // Uses a transaction to ensure atomicity for the increment and expire
        // However, standard pattern: INCR -> if 1 -> EXPIRE is simple enough.
        // For strict correctness with pipelines:
        const attempts = await redis.incr(rKey);

        // If it's the first attempt, set the expiry
        if (attempts === 1) {
            await redis.expire(rKey, windowSeconds);
        }

        const ttl = await redis.ttl(rKey);

        // Calculate reset time
        // If ttl is -1 (no expiry) or -2 (not found), default to window
        // But since we just INCR'd, it should exist.
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

    /**
     * Clean up - no-op for Redis impl but kept for API compatibility if needed
     */
    destroy() {
        // No local cleanup needed for Redis
    }
}

// Create a singleton instance
const rateLimiter = new RedisRateLimiter();

/**
 * Rate limit configurations for different endpoints
 */
export const RateLimitConfig = {
    // Share links: 10 requests per 10 seconds per IP
    SHARE_ACCESS: {
        limit: 10,
        windowMs: 10 * 1000,
    },
    // API v1: 100 requests per minute per API key
    API_V1: {
        limit: 100,
        windowMs: 60 * 1000,
    },
} as const;

/**
 * Apply rate limiting to a share access request
 * @param shareId - The share ID being accessed
 * @param ip - The IP address of the requester
 */
export async function rateLimitShareAccess(shareId: string, ip: string) {
    const key = `share_${shareId}_${ip}`;
    return rateLimiter.limit(
        key,
        RateLimitConfig.SHARE_ACCESS.limit,
        RateLimitConfig.SHARE_ACCESS.windowMs
    );
}

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
