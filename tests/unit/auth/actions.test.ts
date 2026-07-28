import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "@/lib/errors";

const { headersMock, cookiesMock, sendOTPMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  cookiesMock: vi.fn(),
  sendOTPMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock("@/modules/auth/application/use-cases/send-otp", () => ({
  sendOTP: sendOTPMock,
}));

import { sendOTPAction } from "@/modules/auth/actions";

describe("sendOTPAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRUSTED_PROXY;
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    });
    sendOTPMock.mockResolvedValue({
      expiresIn: 300,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      canResendAt: null,
    });
  });

  it("forwards email with host and x-forwarded-for ip", async () => {
    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "x-forwarded-for") return "203.0.113.7, 10.0.0.1";
        if (key === "host") return "cashier.example";
        return null;
      },
    });

    await expect(sendOTPAction("User@Example.com", "zh")).resolves.toMatchObject({ ok: true });

    expect(sendOTPMock).toHaveBeenCalledWith({
      email: "User@Example.com",
      ip: "203.0.113.7",
      host: "cashier.example",
      locale: "zh",
    });
  });

  it("returns invalid_email before invoking use case", async () => {
    headersMock.mockResolvedValue({
      get: (_key: string) => null,
    });

    await expect(sendOTPAction("not-an-email", "en")).resolves.toEqual({
      ok: false,
      code: "invalid_email",
    });
    expect(sendOTPMock).not.toHaveBeenCalled();
  });

  it("returns a stable rate-limit result with retry timing", async () => {
    headersMock.mockResolvedValue({
      get: (_key: string) => null,
    });
    sendOTPMock.mockRejectedValueOnce(new RateLimitError("wait", 42));

    await expect(sendOTPAction("test@example.com", "en")).resolves.toEqual({
      ok: false,
      code: "rate_limited",
      retryAfter: 42,
    });
  });

  it("falls back to unknown ip and localhost host", async () => {
    headersMock.mockResolvedValue({
      get: (_key: string) => null,
    });

    await sendOTPAction("test@example.com", "en");

    expect(sendOTPMock).toHaveBeenCalledWith({
      email: "test@example.com",
      ip: "unknown",
      host: "localhost",
      locale: "en",
    });
  });

  it("prefers x-real-ip when TRUSTED_PROXY is configured", async () => {
    process.env.TRUSTED_PROXY = "nginx";

    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "x-real-ip") return "198.51.100.12";
        if (key === "x-forwarded-for") return "203.0.113.7";
        if (key === "host") return "cashier.example";
        return null;
      },
    });

    await sendOTPAction("test@example.com", "en");

    expect(sendOTPMock).toHaveBeenCalledWith({
      email: "test@example.com",
      ip: "198.51.100.12",
      host: "cashier.example",
      locale: "en",
    });
  });
});
