import { getRedisConnection } from "@/lib/flow/connection";
import { logger } from "@/lib/logger";

const RATE_LIMIT_PREFIX = "auth:rate:";
const MAX_ATTEMPTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX || "5");
const WINDOW_SECONDS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW || "60");

/**
 * Check if a login attempt should be rate limited
 * @param identifier - Email or IP address to rate limit
 * @returns true if the request is allowed, false if rate limited
 */
export async function checkRateLimit(identifier: string): Promise<boolean> {
    try {
        const redis = getRedisConnection();
        const key = `${RATE_LIMIT_PREFIX}${identifier}`;

        const attempts = await redis.incr(key);
        if (attempts === 1) {
            await redis.expire(key, WINDOW_SECONDS);
        }

        if (attempts > MAX_ATTEMPTS) {
            logger.warn({ identifier, attempts }, "Rate limit exceeded for login");
            return false;
        }

        return true;
    } catch (error) {
        // If Redis fails, allow the request but log the error
        logger.error({ error, identifier }, "Rate limit check failed");
        return true;
    }
}

/**
 * Get remaining attempts for an identifier
 */
export async function getRemainingAttempts(identifier: string): Promise<number> {
    try {
        const redis = getRedisConnection();
        const key = `${RATE_LIMIT_PREFIX}${identifier}`;
        const attempts = await redis.get(key);
        return Math.max(0, MAX_ATTEMPTS - (parseInt(attempts || "0")));
    } catch {
        return MAX_ATTEMPTS;
    }
}
