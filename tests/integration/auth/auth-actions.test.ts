import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { otpTokens } from "@/persistence";
import { eq } from "drizzle-orm";
import { memoryStore } from "@/lib/memory-store";

// Mock Resend before importing actions
vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ id: "test-email-id" }),
    };
  },
}));

// Mock headers and cookies
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => {
      if (key === "x-forwarded-for") return "127.0.0.1";
      if (key === "x-real-ip") return "127.0.0.1";
      return null;
    }),
  }),
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(() => undefined),
  }),
}));

import { sendOTPAction } from "@/modules/auth/actions";
import { ValidationError, RateLimitError } from "@/lib/errors";

const TEST_EMAIL = "test@example.com";

describe("Auth Actions - sendOTPAction", () => {
  beforeEach(async () => {
    // Clean up
    const db = getTestDb();
    await db.delete(otpTokens).where(eq(otpTokens.email, TEST_EMAIL));
    await memoryStore.flushall();
  });

  it("should send OTP successfully with valid email", async () => {
    const result = await sendOTPAction(TEST_EMAIL, "zh");

    expect(result.expiresIn).toBeDefined();
    expect(result.expiresAt).toBeDefined();
    expect(result.canResendAt).toBeDefined();

    // Verify OTP was created in database
    const db = getTestDb();
    const record = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, TEST_EMAIL),
    });
    expect(record).toBeDefined();
    expect(record?.tokenHash).toBeDefined();
  });

  it("should reject empty email", async () => {
    await expect(sendOTPAction("", "zh")).rejects.toThrow(ValidationError);
    await expect(sendOTPAction("", "zh")).rejects.toThrow("Invalid email address");
  });

  it("should reject null email", async () => {
    await expect(sendOTPAction(null as unknown as string, "zh")).rejects.toThrow(ValidationError);
    await expect(sendOTPAction(null as unknown as string, "zh")).rejects.toThrow(
      "Invalid email address"
    );
  });

  it("should reject invalid email format", async () => {
    await expect(sendOTPAction("not-an-email", "zh")).rejects.toThrow(ValidationError);
    await expect(sendOTPAction("not-an-email", "zh")).rejects.toThrow("Invalid email format");
  });

  it("should reject email exceeding max length (254 chars)", async () => {
    const longEmail = "a".repeat(250) + "@test.com";
    await expect(sendOTPAction(longEmail, "zh")).rejects.toThrow(ValidationError);
    await expect(sendOTPAction(longEmail, "zh")).rejects.toThrow("Invalid email address");
  });

  it("should normalize email to lowercase", async () => {
    const mixedCaseEmail = "Test@Example.COM";
    await sendOTPAction(mixedCaseEmail, "zh");

    const db = getTestDb();
    const record = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, "test@example.com"),
    });
    expect(record).toBeDefined();
  });

  it("should enforce resend cooldown", async () => {
    // First send should succeed
    const result1 = await sendOTPAction(TEST_EMAIL, "zh");
    expect(result1.expiresAt).toBeDefined();

    // Immediate second send should fail with cooldown
    await expect(sendOTPAction(TEST_EMAIL, "zh")).rejects.toThrow(RateLimitError);
    await expect(sendOTPAction(TEST_EMAIL, "zh")).rejects.toThrow("wait");
  });
});
