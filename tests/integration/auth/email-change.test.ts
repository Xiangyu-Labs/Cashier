import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { emailChangeChallenges, otpTokens, users } from "@/persistence";
import { hashOTP } from "@/modules/auth/services/otp";
import { ConflictError, ValidationError } from "@/lib/errors";

const userId = "00000000-0000-0000-0000-000000000000";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "00000000-0000-0000-0000-000000000000", email: "test@example.com" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: vi.fn().mockResolvedValue({ id: "email-id" }) };
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn(() => null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(() => undefined) }),
}));

import { sendEmailChangeCodeAction, verifyEmailChangeCodeAction } from "@/modules/auth/actions";

describe("email change challenges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a dedicated challenge without creating a login OTP or user", async () => {
    await sendEmailChangeCodeAction("New@Example.com", "en-US");
    const db = getTestDb();
    const challenge = await db.query.emailChangeChallenges.findFirst({
      where: eq(emailChangeChallenges.userId, userId),
    });
    expect(challenge?.newEmail).toBe("new@example.com");
    expect(
      await db.query.otpTokens.findFirst({ where: eq(otpTokens.email, "new@example.com") })
    ).toBeUndefined();
    expect(
      await db.query.users.findFirst({ where: eq(users.email, "new@example.com") })
    ).toBeUndefined();
  });

  it("updates the same user after successful verification", async () => {
    const db = getTestDb();
    await db.insert(emailChangeChallenges).values({
      userId,
      newEmail: "new@example.com",
      tokenHash: hashOTP("123456"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(verifyEmailChangeCodeAction("new@example.com", "123456")).resolves.toEqual({
      email: "new@example.com",
    });
    const updated = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(updated?.email).toBe("new@example.com");
    expect(
      await db.query.emailChangeChallenges.findFirst({
        where: eq(emailChangeChallenges.userId, userId),
      })
    ).toBeUndefined();
  });

  it("persists incorrect attempts and rejects expired codes", async () => {
    const db = getTestDb();
    await db.insert(emailChangeChallenges).values({
      userId,
      newEmail: "new@example.com",
      tokenHash: hashOTP("123456"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(verifyEmailChangeCodeAction("new@example.com", "000000")).rejects.toThrow(
      ValidationError
    );
    const failed = await db.query.emailChangeChallenges.findFirst({
      where: eq(emailChangeChallenges.userId, userId),
    });
    expect(failed?.attempts).toBe(1);
    await db
      .update(emailChangeChallenges)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(emailChangeChallenges.userId, userId));
    await expect(verifyEmailChangeCodeAction("new@example.com", "123456")).rejects.toThrow(
      "expired"
    );
  });

  it("checks target-email uniqueness again during verification", async () => {
    const db = getTestDb();
    await db.insert(users).values({ id: crypto.randomUUID(), email: "taken@example.com" });
    await db.insert(emailChangeChallenges).values({
      userId,
      newEmail: "taken@example.com",
      tokenHash: hashOTP("123456"),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(verifyEmailChangeCodeAction("taken@example.com", "123456")).rejects.toThrow(
      ConflictError
    );
    const original = await db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.email, "test@example.com")),
    });
    expect(original).toBeDefined();
  });
});
