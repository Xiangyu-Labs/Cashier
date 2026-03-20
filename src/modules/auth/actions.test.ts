import { beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, sendOTPMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  sendOTPMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("./use-cases", () => ({
  sendOTP: sendOTPMock,
  deleteAccount: vi.fn(),
}));

import { sendOTPAction } from "./actions";

describe("sendOTPAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRUSTED_PROXY;
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

    await sendOTPAction("User@Example.com", "zh");

    expect(sendOTPMock).toHaveBeenCalledWith({
      email: "User@Example.com",
      ip: "203.0.113.7",
      host: "cashier.example",
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
    });
  });
});
