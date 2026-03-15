import { describe, it, expect, beforeEach } from "vitest";
import {
  generateOTP,
  hashOTP,
  verifyOTP,
  isValidOTPFormat,
  getOTPExpiration,
  getLockoutExpiration,
  getMaxAttempts,
  getResendCooldown,
} from "@/features/auth/server/services/otp";

describe("OTP Utility Functions", () => {
  describe("generateOTP", () => {
    it("should generate a 6-digit OTP", () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp).toHaveLength(6);
    });

    it("should generate different OTPs on subsequent calls", () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();
      const otp3 = generateOTP();

      // At least one should be different (extremely high probability)
      expect(otp1 !== otp2 || otp2 !== otp3).toBe(true);
    });

    it("should pad with leading zeros", () => {
      // Test multiple times to increase chance of getting a number < 100000
      const otps = Array.from({ length: 100 }, () => generateOTP());
      otps.forEach((otp) => {
        expect(otp).toHaveLength(6);
        expect(otp).toMatch(/^\d{6}$/);
      });
    });
  });

  describe("hashOTP", () => {
    it("should produce SHA-256 hash with embedded salt", () => {
      const otp = "123456";
      const hash = hashOTP(otp);

      // New format: hash:salt (64 hex chars + 1 colon + 32 hex salt = 97 chars)
      expect(hash).toHaveLength(97);
      expect(hash).toMatch(/^[a-f0-9]{64}:[a-f0-9]{32}$/);
    });

    it("should produce different hashes for same input (due to random salt)", () => {
      const otp = "123456";
      const hash1 = hashOTP(otp);
      const hash2 = hashOTP(otp);

      // Different salts means different hashes
      expect(hash1).not.toBe(hash2);
      // But both should be valid formats
      expect(hash1).toMatch(/^[a-f0-9]{64}:[a-f0-9]{32}$/);
      expect(hash2).toMatch(/^[a-f0-9]{64}:[a-f0-9]{32}$/);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashOTP("123456");
      const hash2 = hashOTP("654321");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyOTP", () => {
    it("should verify correct OTP", () => {
      const otp = "123456";
      const hash = hashOTP(otp);

      expect(verifyOTP(otp, hash)).toBe(true);
    });

    it("should reject incorrect OTP", () => {
      const otp = "123456";
      const hash = hashOTP(otp);

      expect(verifyOTP("654321", hash)).toBe(false);
    });

    it("should be case sensitive (though OTPs are numeric)", () => {
      const hash = hashOTP("123456");
      expect(verifyOTP("123456", hash)).toBe(true);
    });
  });

  describe("isValidOTPFormat", () => {
    it("should accept valid 6-digit OTPs", () => {
      expect(isValidOTPFormat("123456")).toBe(true);
      expect(isValidOTPFormat("000000")).toBe(true);
      expect(isValidOTPFormat("999999")).toBe(true);
    });

    it("should reject non-6-digit strings", () => {
      expect(isValidOTPFormat("12345")).toBe(false);
      expect(isValidOTPFormat("1234567")).toBe(false);
      expect(isValidOTPFormat("")).toBe(false);
    });

    it("should reject non-numeric strings", () => {
      expect(isValidOTPFormat("12345a")).toBe(false);
      expect(isValidOTPFormat("abc123")).toBe(false);
      expect(isValidOTPFormat("12 34 56")).toBe(false);
    });
  });

  describe("Configuration helpers", () => {
    beforeEach(() => {
      delete process.env.OTP_EXPIRES_SECONDS;
      delete process.env.OTP_MAX_ATTEMPTS;
      delete process.env.OTP_LOCKOUT_MINUTES;
      delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
    });

    describe("getOTPExpiration", () => {
      it("should return default 5 minutes", () => {
        const expiration = getOTPExpiration();
        const now = new Date();
        const diff = expiration.getTime() - now.getTime();

        // Should be approximately 5 minutes (300 seconds)
        expect(diff).toBeGreaterThan(299000);
        expect(diff).toBeLessThan(301000);
      });

      it("should respect custom expiration", () => {
        process.env.OTP_EXPIRES_SECONDS = "600"; // 10 minutes
        const expiration = getOTPExpiration();
        const now = new Date();
        const diff = expiration.getTime() - now.getTime();

        expect(diff).toBeGreaterThan(599000);
        expect(diff).toBeLessThan(601000);
      });
    });

    describe("getLockoutExpiration", () => {
      it("should return default 15 minutes", () => {
        const expiration = getLockoutExpiration();
        const now = new Date();
        const diff = expiration.getTime() - now.getTime();

        // Should be approximately 15 minutes (900 seconds)
        expect(diff).toBeGreaterThan(899000);
        expect(diff).toBeLessThan(901000);
      });

      it("should respect custom lockout duration", () => {
        process.env.OTP_LOCKOUT_MINUTES = "30";
        const expiration = getLockoutExpiration();
        const now = new Date();
        const diff = expiration.getTime() - now.getTime();

        expect(diff).toBeGreaterThan(1799000); // 30 min
        expect(diff).toBeLessThan(1801000);
      });
    });

    describe("getMaxAttempts", () => {
      it("should return default 5 attempts", () => {
        expect(getMaxAttempts()).toBe(5);
      });

      it("should respect custom max attempts", () => {
        process.env.OTP_MAX_ATTEMPTS = "3";
        expect(getMaxAttempts()).toBe(3);
      });
    });

    describe("getResendCooldown", () => {
      it("should return default 60 seconds", () => {
        expect(getResendCooldown()).toBe(60);
      });

      it("should respect custom cooldown", () => {
        process.env.OTP_RESEND_COOLDOWN_SECONDS = "120";
        expect(getResendCooldown()).toBe(120);
      });
    });
  });
});
