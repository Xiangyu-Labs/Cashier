import { memoryStore } from "@/lib/memory-store";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { getResendCooldown } from "./otp";

const OTP_SEND_PREFIX = "otp:send:";
const OTP_SEND_IP_PREFIX = "otp:send:ip:";
const OTP_RESEND_PREFIX = "otp:resend:";
const OTP_VERIFY_PREFIX = "otp:verify:";

const IP_WINDOW_SECONDS = 60 * 60;
const VERIFY_WINDOW_SECONDS = 60;

function getSendMaxAttempts(): number {
  return runtimeEnv.authRateLimitMax;
}

function getSendWindowSeconds(): number {
  return runtimeEnv.authRateLimitWindow;
}

function getIpMaxAttempts(): number {
  return runtimeEnv.otpIpMaxAttemptsPerHour;
}

function getVerifyMaxAttempts(): number {
  return runtimeEnv.otpVerifyMaxAttemptsPerMinute;
}

export async function checkSendRateLimit(email: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_SEND_PREFIX}${email.toLowerCase()}`;
    const sendWindowSeconds = getSendWindowSeconds();
    const sendMaxAttempts = getSendMaxAttempts();

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, sendWindowSeconds);
    }

    if (attempts > sendMaxAttempts) {
      const ttl = await store.ttl(key);
      logger.warn({ email, attempts }, "OTP send rate limit exceeded for email");
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfter: ttl > 0 ? ttl : sendWindowSeconds,
      };
    }

    return {
      allowed: true,
      remainingAttempts: sendMaxAttempts - attempts,
    };
  } catch (error) {
    logger.error({ error, email }, "OTP send rate limit check failed");
    return { allowed: true, remainingAttempts: getSendMaxAttempts() };
  }
}

export async function checkSendRateLimitByIP(ip: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_SEND_IP_PREFIX}${ip}`;
    const ipMaxAttempts = getIpMaxAttempts();

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, IP_WINDOW_SECONDS);
    }

    if (attempts > ipMaxAttempts) {
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
      remainingAttempts: ipMaxAttempts - attempts,
    };
  } catch (error) {
    logger.error({ error, ip }, "OTP send IP rate limit check failed");
    return { allowed: true, remainingAttempts: getIpMaxAttempts() };
  }
}

export async function checkResendCooldown(email: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  try {
    const store = memoryStore;
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;

    const ttl = await store.ttl(key);

    if (ttl <= 0) {
      return { allowed: true };
    }

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

export async function getCanResendAt(email: string): Promise<number | null> {
  try {
    const store = memoryStore;
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const ttl = await store.ttl(key);

    if (ttl <= 0) {
      return null;
    }

    return Math.floor(Date.now() / 1000) + ttl;
  } catch (error) {
    logger.error({ error, email }, "Failed to get canResendAt timestamp");
    return null;
  }
}

export async function checkVerifyRateLimit(ip: string): Promise<boolean> {
  try {
    const store = memoryStore;
    const key = `${OTP_VERIFY_PREFIX}${ip}`;
    const verifyMaxAttempts = getVerifyMaxAttempts();

    const attempts = await store.incr(key);
    if (attempts === 1) {
      await store.expire(key, VERIFY_WINDOW_SECONDS);
    }

    if (attempts > verifyMaxAttempts) {
      logger.warn({ ip, attempts }, "OTP verify rate limit exceeded for IP");
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error, ip }, "OTP verify rate limit check failed");
    return true;
  }
}
