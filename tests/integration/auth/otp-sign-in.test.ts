import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { otpTokens } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/features/auth/error-codes";
import { hashOTP } from "@/features/auth/server/services/otp";
import {
  authenticateWithOTP,
  OTPExpiredSignInError,
  OTPInvalidSignInError,
  OTPLockedSignInError,
  OTPRateLimitedSignInError,
} from "@/features/auth/server/services/otp-sign-in";
import { memoryStore } from "@/lib/memory-store";

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ id: "test-email-id" }),
    };
  },
}));

const TEST_EMAIL = "test@example.com";
const REQUEST_HEADERS = new Headers({ "x-forwarded-for": "127.0.0.1" });

async function createTestOTP(email: string, otp: string, expiresAt?: Date) {
  const db = getTestDb();

  await db.insert(otpTokens).values({
    email: email.toLowerCase(),
    tokenHash: hashOTP(otp),
    expires: expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
  });
}

describe("authenticateWithOTP", () => {
  const originalDisableRegistration = process.env.DISABLE_REGISTRATION;
  const originalOTPMaxAttempts = process.env.OTP_MAX_ATTEMPTS;

  beforeEach(async () => {
    delete process.env.DISABLE_REGISTRATION;
    delete process.env.OTP_MAX_ATTEMPTS;
    await memoryStore.flushall();
  });

  afterEach(() => {
    if (originalDisableRegistration == null) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalDisableRegistration;
    }

    if (originalOTPMaxAttempts == null) {
      delete process.env.OTP_MAX_ATTEMPTS;
    } else {
      process.env.OTP_MAX_ATTEMPTS = originalOTPMaxAttempts;
    }
  });

  it("signs in successfully with a valid OTP", async () => {
    await createTestOTP(TEST_EMAIL, "123456");

    const result = await authenticateWithOTP({
      email: TEST_EMAIL,
      otp: "123456",
      locale: "zh",
      requestHeaders: REQUEST_HEADERS,
    });

    expect(result).toMatchObject({ email: TEST_EMAIL });

    const db = getTestDb();
    const token = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, TEST_EMAIL),
    });
    expect(token).toBeUndefined();
  });

  it("returns otp_invalid for an incorrect OTP", async () => {
    await createTestOTP(TEST_EMAIL, "123456");

    let error: unknown;

    try {
      await authenticateWithOTP({
        email: TEST_EMAIL,
        otp: "999999",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(OTPInvalidSignInError);
    expect(error).toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID });

    const db = getTestDb();
    const token = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, TEST_EMAIL),
    });
    expect(token?.attempts).toBe(1);
  });

  it("returns otp_expired for an expired OTP", async () => {
    await createTestOTP(TEST_EMAIL, "123456", new Date(Date.now() - 1000));

    await expect(
      authenticateWithOTP({
        email: TEST_EMAIL,
        otp: "123456",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      })
    ).rejects.toBeInstanceOf(OTPExpiredSignInError);

    await expect(
      authenticateWithOTP({
        email: TEST_EMAIL,
        otp: "123456",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_EXPIRED });
  });

  it("returns otp_locked after too many failed attempts", async () => {
    await createTestOTP(TEST_EMAIL, "123456");

    let error: unknown;

    for (let i = 0; i < 5; i++) {
      try {
        await authenticateWithOTP({
          email: TEST_EMAIL,
          otp: "999999",
          locale: "zh",
          requestHeaders: REQUEST_HEADERS,
        });
      } catch (caughtError) {
        error = caughtError;
      }
    }

    expect(error).toBeInstanceOf(OTPLockedSignInError);
    expect(error).toMatchObject({ code: AUTH_ERROR_CODES.OTP_LOCKED });

    const db = getTestDb();
    const token = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, TEST_EMAIL),
    });
    expect(token?.lockedUntil).toBeInstanceOf(Date);
  });

  it("returns otp_rate_limited when verify attempts exceed the IP limit", async () => {
    process.env.OTP_MAX_ATTEMPTS = "10";
    await createTestOTP(TEST_EMAIL, "123456");

    for (let i = 0; i < 5; i++) {
      try {
        await authenticateWithOTP({
          email: TEST_EMAIL,
          otp: "999999",
          locale: "zh",
          requestHeaders: REQUEST_HEADERS,
        });
      } catch {
        // Expected invalid attempts before the IP-level rate limit kicks in.
      }
    }

    await expect(
      authenticateWithOTP({
        email: TEST_EMAIL,
        otp: "999999",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      })
    ).rejects.toBeInstanceOf(OTPRateLimitedSignInError);

    await expect(
      authenticateWithOTP({
        email: TEST_EMAIL,
        otp: "999999",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_RATE_LIMITED });
  });
});
