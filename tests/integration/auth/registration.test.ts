import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "../../setup";
import { users } from "@/persistence";
import { hashOTP } from "@/features/auth/server/services/otp";
import { otpTokens } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/features/auth/error-codes";
import { authenticateWithOTP } from "@/features/auth/server/services/otp-sign-in";
import { RegistrationDisabledError } from "@/features/auth/server/services/registration";
import { memoryStore } from "@/lib/memory-store";

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ id: "test-email-id" }),
    };
  },
}));

const REQUEST_HEADERS = new Headers({ "x-forwarded-for": "127.0.0.1" });

async function createTestOTP(email: string, otp: string) {
  const db = getTestDb();
  const tokenHash = hashOTP(otp);

  await db.insert(otpTokens).values({
    email: email.toLowerCase(),
    tokenHash,
    expires: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
  });
}

describe("Registration Policy", () => {
  const originalDisableRegistration = process.env.DISABLE_REGISTRATION;

  beforeEach(async () => {
    process.env.DISABLE_REGISTRATION = "true";
    await memoryStore.flushall();
  });

  afterEach(() => {
    if (originalDisableRegistration == null) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalDisableRegistration;
    }
  });

  it("throws a registration-disabled credentials error for new users", async () => {
    await createTestOTP("new-user@example.com", "123456");

    let error: unknown;

    try {
      await authenticateWithOTP({
        email: "new-user@example.com",
        otp: "123456",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({ code: AUTH_ERROR_CODES.REGISTRATION_DISABLED });
    expect(error).toBeInstanceOf(RegistrationDisabledError);
  });

  it("allows existing users to sign in when registration is disabled", async () => {
    const db = getTestDb();

    await db.insert(users).values({
      id: "00000000-0000-0000-0000-000000000099",
      email: "existing@example.com",
      name: "Existing User",
      emailVerified: new Date(),
    });

    await createTestOTP("existing@example.com", "123456");

    await expect(
      authenticateWithOTP({
        email: "existing@example.com",
        otp: "123456",
        locale: "zh",
        requestHeaders: REQUEST_HEADERS,
      })
    ).resolves.toMatchObject({
      email: "existing@example.com",
      id: "00000000-0000-0000-0000-000000000099",
    });
  });
});
