import { memoryStore } from "@/lib/memory-store";
import { logger } from "@/lib/logger";
import { getResendCooldown } from "./otp";

const OTP_SEND_PREFIX = "otp:send:";
const OTP_SEND_IP_PREFIX = "otp:send:ip:";
const OTP_RESEND_PREFIX = "otp:resend:";
const OTP_VERIFY_PREFIX = "otp:verify:";

// Rate limits (configurable via environment variables)
const SEND_MAX_ATTEMPTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "10", 10);
const SEND_WINDOW_SECONDS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW ?? "900", 10);
const IP_MAX_ATTEMPTS = 10; // 10 sends per IP
const IP_WINDOW_SECONDS = 60 * 60; // 1 hour
const VERIFY_MAX_ATTEMPTS = 10; // 10 verifies per IP per minute
const VERIFY_WINDOW_SECONDS = 60; // 1 minute

/**
 * Check if an email can send OTP (10 per 15 minutes)
 * @param email - User email address
 * @returns Object with allowed status and retry info
 */
export async function checkSendRateLimit(email: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_SEND_PREFIX}${email.toLowerCase()}`;

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, SEND_WINDOW_SECONDS);
    }

    if (attempts > SEND_MAX_ATTEMPTS) {
      const ttl = await store.ttl(key);
      logger.warn({ email, attempts }, "OTP send rate limit exceeded for email");
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfter: ttl > 0 ? ttl : SEND_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remainingAttempts: SEND_MAX_ATTEMPTS - attempts,
    };
  } catch (error) {
    logger.error({ error, email }, "OTP send rate limit check failed");
    return { allowed: true, remainingAttempts: SEND_MAX_ATTEMPTS };
  }
}

/**
 * Check if an IP can send OTP (10 per hour)
 * @param ip - IP address
 * @returns Object with allowed status and retry info
 */
export async function checkSendRateLimitByIP(ip: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_SEND_IP_PREFIX}${ip}`;

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, IP_WINDOW_SECONDS);
    }

    if (attempts > IP_MAX_ATTEMPTS) {
      const ttl = await store.ttl(key);
      logger.warn({ ip, attempts }, "OTP send rate limit exceeded for IP");
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfter: ttl > 0 ? ttl : IP_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remainingAttempts: IP_MAX_ATTEMPTS - attempts,
    };
  } catch (error) {
    logger.error({ error, ip }, "OTP send IP rate limit check failed");
    return { allowed: true, remainingAttempts: IP_MAX_ATTEMPTS };
  }
}

/**
 * Check if an email can resend OTP (60 second cooldown between sends)
 * @param email - User email address
 * @returns Object with allowed status and remaining cooldown
 */
export async function checkResendCooldown(email: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;

    const ttl = await store.ttl(key);

    // If key doesn't exist (ttl = -2) or expired (ttl = -1), allow
    if (ttl <= 0) {
      return { allowed: true };
    }

    // Key exists and hasn't expired
    logger.info({ email, ttl }, "OTP resend cooldown active");
    return {
      allowed: false,
      retryAfter: ttl,
    };
  } catch (error) {
    logger.error({ error, email }, "OTP resend cooldown check failed");
    return { allowed: true };
  }
}

/**
 * Set resend cooldown after successful OTP send
 * @param email - User email address
 */
export async function setResendCooldown(email: string): Promise<void> {
  try {
    const store = memoryStore;
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const cooldown = getResendCooldown();

    await store.setex(key, cooldown, "1");
  } catch (error) {
    logger.error({ error, email }, "Failed to set OTP resend cooldown");
  }
}

/**
 * Get the timestamp when the user can next resend OTP
 * @param email - User email address
 * @returns Unix timestamp in seconds, or null if can resend now
 */
export async function getCanResendAt(email: string): Promise<number | null> {
  try {
    const store = memoryStore;
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const ttl = await store.ttl(key);

    if (ttl <= 0) {
      return null; // Can resend now
    }

    return Math.floor(Date.now() / 1000) + ttl;
  } catch (error) {
    logger.error({ error, email }, "Failed to get canResendAt timestamp");
    return null;
  }
}

/**
 * Check if an IP can verify OTP (10 per minute to prevent brute force)
 * @param ip - IP address
 * @returns true if allowed, false if rate limited
 */
export async function checkVerifyRateLimit(ip: string): Promise<boolean> {
  try {
    const store = memoryStore;
    const key = `${OTP_VERIFY_PREFIX}${ip}`;

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, VERIFY_WINDOW_SECONDS);
    }

    if (attempts > VERIFY_MAX_ATTEMPTS) {
      logger.warn({ ip, attempts }, "OTP verify rate limit exceeded for IP");
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error, ip }, "OTP verify rate limit check failed");
    return true;
  }
}
