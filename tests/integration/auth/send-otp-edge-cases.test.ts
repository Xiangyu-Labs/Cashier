import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { render } from "@react-email/render";
import { otpTokens } from "@/persistence/schema/auth";
import { getTestDb } from "tests/setup";
import { memoryStore } from "@/lib/memory-store";

const { headersMock, resendSendMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  resendSendMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: resendSendMock,
    };
  },
}));

import { sendOTPAction } from "@/modules/auth/actions";

describe("sendOTPAction edge cases", () => {
  const _originalResendKey = process.env.AUTH_RESEND_KEY;
  const _originalEmailFrom = process.env.AUTH_EMAIL_FROM;
  const testEmail = "edge-auth@example.com";

  beforeEach(async () => {
    vi.clearAllMocks();
    await memoryStore.flushall();
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.AUTH_EMAIL_FROM;

    const db = getTestDb();
    await db.delete(otpTokens).where(eq(otpTokens.email, testEmail));

    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "x-forwarded-for") return "203.0.113.18";
        return null;
      },
    });
    resendSendMock.mockResolvedValue({ id: "test-email-id" });
  });

  it("uses localhost when host header is missing and still creates token", async () => {
    process.env.AUTH_RESEND_KEY = "test-resend-key";

    await sendOTPAction(testEmail, "en");

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const firstCall = resendSendMock.mock.calls[0]?.[0];
    const renderedEmail = await render(firstCall?.react);
    expect(renderedEmail).toContain("Sign in to");
    expect(renderedEmail).toContain("localhost</h1>");
    expect(firstCall?.to).toBe(testEmail);

    const db = getTestDb();
    const token = await db.query.otpTokens.findFirst({
      where: eq(otpTokens.email, testEmail),
    });
    expect(token).toBeDefined();
  });

  it("returns user-facing error when email provider send fails", async () => {
    process.env.AUTH_RESEND_KEY = "test-resend-key";
    resendSendMock.mockRejectedValueOnce(new Error("provider down"));

    await expect(sendOTPAction(testEmail, "en")).rejects.toThrow(
      "Failed to send verification code. Please try again."
    );
  });
});
