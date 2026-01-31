/**
 * Rate Limiting Utilities
 *
 * Provides in-memory rate limiting for API endpoints.
 * For production use with multiple instances, consider using Redis-based solution
 * like @upstash/ratelimit.
 */

interface RateLimitStore {
    count: number;
    resetTime: number;
}

class InMemoryRateLimiter {
    private store: Map<string, RateLimitStore> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Clean up expired entries every minute
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.store.entries()) {
                if (now > value.resetTime) {
                    this.store.delete(key);
                }
            }
        }, 60000);
    }

    /**
     * Check if a request should be rate limited
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
        const now = Date.now();
        const stored = this.store.get(key);

        // If no record exists or window has expired, create new record
        if (!stored || now > stored.resetTime) {
            const resetTime = now + windowMs;
            this.store.set(key, { count: 1, resetTime });
            return {
                success: true,
                remaining: limit - 1,
                resetTime,
            };
        }

        // Increment counter
        stored.count += 1;

        // Check if limit exceeded
        if (stored.count > limit) {
            return {
                success: false,
                remaining: 0,
                resetTime: stored.resetTime,
            };
        }

        return {
            success: true,
            remaining: limit - stored.count,
            resetTime: stored.resetTime,
        };
    }

    /**
     * Clean up and stop the cleanup interval
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.store.clear();
    }
}

// Create a singleton instance
const rateLimiter = new InMemoryRateLimiter();

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
