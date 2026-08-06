import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkSendRateLimit as checkSendRateLimitUseCase,
  checkSendRateLimitByIP as checkSendRateLimitByIPUseCase,
  checkResendCooldown as checkResendCooldownUseCase,
  setResendCooldown as setResendCooldownUseCase,
  getCanResendAt as getCanResendAtUseCase,
  checkVerifyRateLimit as checkVerifyRateLimitUseCase,
} from "@/modules/auth/services/otp-rate-limit";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const checkSendRateLimit = (value: string) => checkSendRateLimitUseCase(value, postgresRateLimiter);
const checkSendRateLimitByIP = (value: string) =>
  checkSendRateLimitByIPUseCase(value, postgresRateLimiter);
const checkResendCooldown = (value: string) =>
  checkResendCooldownUseCase(value, postgresRateLimiter);
const setResendCooldown = (value: string) => setResendCooldownUseCase(value, postgresRateLimiter);
const getCanResendAt = (value: string) => getCanResendAtUseCase(value, postgresRateLimiter);
const checkVerifyRateLimit = (value: string) =>
  checkVerifyRateLimitUseCase(value, postgresRateLimiter);

describe("OTP Rate Limiting", () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM rate_limit_buckets`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkSendRateLimit (per email)", () => {
    it("should allow first 10 sends within 15 minutes", async () => {
      const email = "test@example.com";

      for (let i = 0; i < 10; i++) {
        const result = await checkSendRateLimit(email);
        expect(result.allowed).toBe(true);
        expect(result.remainingAttempts).toBe(10 - i - 1);
      }
    });

    it("should block 11th send and return retryAfter", async () => {
      const email = "test@example.com";

      // Use up 10 attempts
      for (let i = 0; i < 10; i++) {
        await checkSendRateLimit(email);
      }

      // 11th attempt should be blocked
      const result = await checkSendRateLimit(email);
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(15 * 60); // Max 15 minutes
    });

    it("should be case-insensitive for email", async () => {
      // Use up 9 attempts with different cases
      for (let i = 0; i < 9; i++) {
        await checkSendRateLimit(i % 2 === 0 ? "Test@Example.COM" : "TEST@EXAMPLE.COM");
      }

      // 10th attempt with lowercase should still work
      const result1 = await checkSendRateLimit("test@example.com");
      expect(result1.allowed).toBe(true);

      // 11th attempt should be blocked
      const result2 = await checkSendRateLimit("test@example.com");
      expect(result2.allowed).toBe(false);
      expect(result2.remainingAttempts).toBe(0);
    });

    it("should fail open on error", async () => {
      vi.spyOn(postgresRateLimiter, "increment").mockRejectedValue(new Error("DB error"));

      const result = await checkSendRateLimit("test@example.com");
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(10); // Default max attempts
    });
  });

  describe("checkSendRateLimitByIP", () => {
    it("does not create a shared IP bucket when the client IP is unknown", async () => {
      const increment = vi.spyOn(postgresRateLimiter, "increment");

      const result = await checkSendRateLimitByIP("unknown");

      expect(result.allowed).toBe(true);
      expect(increment).not.toHaveBeenCalled();
    });
    it("should allow first 10 sends within 1 hour", async () => {
      const ip = "192.168.1.1";

      for (let i = 0; i < 10; i++) {
        const result = await checkSendRateLimitByIP(ip);
        expect(result.allowed).toBe(true);
        expect(result.remainingAttempts).toBe(10 - i - 1);
      }
    });

    it("should block 11th send and return retryAfter", async () => {
      const ip = "192.168.1.1";

      // Use up 10 attempts
      for (let i = 0; i < 10; i++) {
        await checkSendRateLimitByIP(ip);
      }

      // 11th attempt should be blocked
      const result = await checkSendRateLimitByIP(ip);
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60 * 60); // Max 1 hour
    });

    it("should fail open on error", async () => {
      vi.spyOn(postgresRateLimiter, "increment").mockRejectedValue(new Error("DB error"));

      const result = await checkSendRateLimitByIP("192.168.1.1");
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(10);
    });
  });

  describe("checkResendCooldown", () => {
    it("should allow resend when no cooldown is active", async () => {
      const email = "test@example.com";

      const result = await checkResendCooldown(email);
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it("should block resend when cooldown is active", async () => {
      const email = "test@example.com";

      // Set cooldown
      await setResendCooldown(email);

      // Check cooldown
      const result = await checkResendCooldown(email);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60); // Max 60 seconds
    });

    it("should be case-insensitive for email", async () => {
      await setResendCooldown("Test@Example.COM");

      const result = await checkResendCooldown("test@example.com");
      expect(result.allowed).toBe(false);
    });

    it("should fail open on error", async () => {
      vi.spyOn(postgresRateLimiter, "getCooldownRemaining").mockRejectedValue(
        new Error("DB error")
      );

      const result = await checkResendCooldown("test@example.com");
      expect(result.allowed).toBe(true);
    });
  });

  describe("getCanResendAt", () => {
    it("should return null when no cooldown is active", async () => {
      const email = "test@example.com";

      const canResendAt = await getCanResendAt(email);
      expect(canResendAt).toBeNull();
    });

    it("should return future timestamp when cooldown is active", async () => {
      const email = "test@example.com";
      const now = Math.floor(Date.now() / 1000);

      await setResendCooldown(email);

      const canResendAt = await getCanResendAt(email);
      expect(canResendAt).not.toBeNull();
      expect(canResendAt!).toBeGreaterThan(now);
      expect(canResendAt!).toBeLessThanOrEqual(now + 60); // Within 60 seconds
    });

    it("should fail open on error", async () => {
      vi.spyOn(postgresRateLimiter, "getCooldownRemaining").mockRejectedValue(
        new Error("DB error")
      );

      const result = await getCanResendAt("test@example.com");
      expect(result).toBeNull();
    });
  });

  describe("checkVerifyRateLimit (brute force protection)", () => {
    it("does not create a shared verification bucket for an unknown IP", async () => {
      const increment = vi.spyOn(postgresRateLimiter, "increment");

      await expect(checkVerifyRateLimit("unknown")).resolves.toBe(true);
      expect(increment).not.toHaveBeenCalled();
    });
    it("should allow first 5 verifications per minute", async () => {
      const ip = "192.168.1.1";

      for (let i = 0; i < 5; i++) {
        const result = await checkVerifyRateLimit(ip);
        expect(result).toBe(true);
      }
    });

    it("should block 6th verification", async () => {
      const ip = "192.168.1.1";

      // Use up 5 attempts
      for (let i = 0; i < 5; i++) {
        await checkVerifyRateLimit(ip);
      }

      // 6th attempt should be blocked
      const result = await checkVerifyRateLimit(ip);
      expect(result).toBe(false);
    });

    it("should fail open on error", async () => {
      vi.spyOn(postgresRateLimiter, "increment").mockRejectedValue(new Error("DB error"));

      const result = await checkVerifyRateLimit("192.168.1.1");
      expect(result).toBe(true); // Fail open
    });
  });

  describe("Rate limit isolation", () => {
    it("should isolate rate limits between different emails", async () => {
      const email1 = "user1@example.com";
      const email2 = "user2@example.com";

      // Use up email1's attempts
      for (let i = 0; i < 10; i++) {
        await checkSendRateLimit(email1);
      }

      // email2 should still have full attempts
      const result = await checkSendRateLimit(email2);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(9);
    });

    it("should isolate rate limits between different IPs", async () => {
      const ip1 = "192.168.1.1";
      const ip2 = "192.168.1.2";

      // Use up ip1's attempts
      for (let i = 0; i < 10; i++) {
        await checkSendRateLimitByIP(ip1);
      }

      // ip2 should still have full attempts
      const result = await checkSendRateLimitByIP(ip2);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(9);
    });
  });
});
