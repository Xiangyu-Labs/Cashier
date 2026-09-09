import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateOTP,
  getLockoutExpiration,
  getMaxAttempts,
  getOTPExpiration,
  getResendCooldown,
  hashOTP,
  isValidOTPFormat,
  verifyOTP,
} from "@/modules/auth/services/otp";

describe("OTP security contracts", () => {
  beforeEach(() => {
    delete process.env.OTP_EXPIRES_SECONDS;
    delete process.env.OTP_MAX_ATTEMPTS;
    delete process.env.OTP_LOCKOUT_MINUTES;
    delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
  });

  it("generates and validates exactly six decimal digits", () => {
    expect(generateOTP()).toMatch(/^\d{6}$/);
    expect(isValidOTPFormat("000000")).toBe(true);
    for (const invalid of ["12345", "1234567", "12345a", "12 345"]) {
      expect(isValidOTPFormat(invalid)).toBe(false);
    }
  });

  it("uses distinct salted v2 hashes that verify only the original OTP", () => {
    const first = hashOTP("123456");
    const second = hashOTP("123456");

    expect(first).toMatch(/^v2:[a-f0-9]{64}:[a-f0-9]{32}$/);
    expect(second).not.toBe(first);
    expect(verifyOTP("123456", first)).toBe(true);
    expect(verifyOTP("654321", first)).toBe(false);
  });

  it("rejects legacy, unknown-version, and malformed hashes", () => {
    const valid = hashOTP("123456");
    for (const stored of [
      "8d969eef6ecad3c29a3a629280e686cff8ca64f6f63f5f5a86aff3ca12020c923:salt",
      `v3:${valid.slice(3)}`,
      `${valid}:extra`,
      "v2:not-hex:not-hex",
      "",
    ]) {
      expect(verifyOTP("123456", stored)).toBe(false);
    }
  });

  it("uses the documented default expiration and lockout durations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    expect(getOTPExpiration()).toEqual(new Date("2026-01-01T00:05:00.000Z"));
    expect(getLockoutExpiration()).toEqual(new Date("2026-01-01T00:15:00.000Z"));
    expect(getMaxAttempts()).toBe(5);
    expect(getResendCooldown()).toBe(60);

    vi.useRealTimers();
  });

  it("honors configured expiration, lockout, attempt, and resend limits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    process.env.OTP_EXPIRES_SECONDS = "600";
    process.env.OTP_LOCKOUT_MINUTES = "30";
    process.env.OTP_MAX_ATTEMPTS = "3";
    process.env.OTP_RESEND_COOLDOWN_SECONDS = "120";

    expect(getOTPExpiration()).toEqual(new Date("2026-01-01T00:10:00.000Z"));
    expect(getLockoutExpiration()).toEqual(new Date("2026-01-01T00:30:00.000Z"));
    expect(getMaxAttempts()).toBe(3);
    expect(getResendCooldown()).toBe(120);

    vi.useRealTimers();
  });
});
