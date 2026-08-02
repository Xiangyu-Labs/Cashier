import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { getResendCooldown } from "./otp";
import type { RateLimitPort } from "../application/ports";

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

export async function checkSendRateLimit(
  email: string,
  rateLimiter: RateLimitPort
): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  try {
    const key = `${OTP_SEND_PREFIX}${email.toLowerCase()}`;
    const sendWindowSeconds = getSendWindowSeconds();
    const sendMaxAttempts = getSendMaxAttempts();

    const result = await rateLimiter.increment(key, sendMaxAttempts, sendWindowSeconds);

    if (!result.success) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      logger.warn(
        { subject: logIdentifier("email", email), attempts: sendMaxAttempts + 1 },
        "OTP send rate limit exceeded for email"
      );
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfter: retryAfter > 0 ? retryAfter : sendWindowSeconds,
      };
    }

    return {
      allowed: true,
      remainingAttempts: result.remaining,
    };
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("email", email) },
      "OTP send rate limit check failed"
    );
    return { allowed: true, remainingAttempts: getSendMaxAttempts() };
  }
}

export async function checkSendRateLimitByIP(
  ip: string,
  rateLimiter: RateLimitPort
): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
}> {
  if (ip === "unknown") {
    return { allowed: true, remainingAttempts: getIpMaxAttempts() };
  }
  try {
    const key = `${OTP_SEND_IP_PREFIX}${ip}`;
    const ipMaxAttempts = getIpMaxAttempts();

    const result = await rateLimiter.increment(key, ipMaxAttempts, IP_WINDOW_SECONDS);

    if (!result.success) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      logger.warn(
        { subject: logIdentifier("ip", ip), attempts: ipMaxAttempts + 1 },
        "OTP send rate limit exceeded for IP"
      );
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfter: retryAfter > 0 ? retryAfter : IP_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remainingAttempts: result.remaining,
    };
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("ip", ip) },
      "OTP send IP rate limit check failed"
    );
    return { allowed: true, remainingAttempts: getIpMaxAttempts() };
  }
}

export async function checkResendCooldown(
  email: string,
  rateLimiter: RateLimitPort
): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  try {
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const cooldown = getResendCooldown();

    const remaining = await rateLimiter.getCooldownRemaining(key, cooldown);

    if (remaining <= 0) {
      return { allowed: true };
    }

    logger.info(
      { subject: logIdentifier("email", email), remaining },
      "OTP resend cooldown active"
    );
    return {
      allowed: false,
      retryAfter: remaining,
    };
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("email", email) },
      "OTP resend cooldown check failed"
    );
    return { allowed: true };
  }
}

export async function setResendCooldown(email: string, rateLimiter: RateLimitPort): Promise<void> {
  try {
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const cooldown = getResendCooldown();

    await rateLimiter.setCooldown(key, cooldown);
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("email", email) },
      "Failed to set OTP resend cooldown"
    );
  }
}

export async function getCanResendAt(
  email: string,
  rateLimiter: RateLimitPort
): Promise<number | null> {
  try {
    const key = `${OTP_RESEND_PREFIX}${email.toLowerCase()}`;
    const cooldown = getResendCooldown();

    const remaining = await rateLimiter.getCooldownRemaining(key, cooldown);

    if (remaining <= 0) {
      return null;
    }

    return Math.floor(Date.now() / 1000) + remaining;
  } catch (error) {
    logger.error(
      { error, subject: logIdentifier("email", email) },
      "Failed to get canResendAt timestamp"
    );
    return null;
  }
}

export async function checkVerifyRateLimit(
  ip: string,
  rateLimiter: RateLimitPort
): Promise<boolean> {
  if (ip === "unknown") return true;
  try {
    const key = `${OTP_VERIFY_PREFIX}${ip}`;
    const verifyMaxAttempts = getVerifyMaxAttempts();

    const result = await rateLimiter.increment(key, verifyMaxAttempts, VERIFY_WINDOW_SECONDS);

    if (!result.success) {
      logger.warn(
        { subject: logIdentifier("ip", ip), attempts: verifyMaxAttempts + 1 },
        "OTP verify rate limit exceeded for IP"
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error, subject: logIdentifier("ip", ip) }, "OTP verify rate limit check failed");
    return true;
  }
}
