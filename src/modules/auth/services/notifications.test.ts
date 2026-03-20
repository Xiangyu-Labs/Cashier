import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, loggerWarnMock, loggerInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: sendMock,
    };
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
    error: loggerErrorMock,
    debug: vi.fn(),
    child: vi.fn(() => ({
      warn: loggerWarnMock,
      info: loggerInfoMock,
      error: loggerErrorMock,
      debug: vi.fn(),
    })),
  },
}));

import { sendLoginNotification } from "./notifications";

describe("sendLoginNotification", () => {
  const originalResendKey = process.env.AUTH_RESEND_KEY;
  const originalEmailFrom = process.env.AUTH_EMAIL_FROM;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ id: "mail-id" });
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.AUTH_EMAIL_FROM;
  });

  afterEach(() => {
    if (originalResendKey == null) {
      delete process.env.AUTH_RESEND_KEY;
    } else {
      process.env.AUTH_RESEND_KEY = originalResendKey;
    }

    if (originalEmailFrom == null) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = originalEmailFrom;
    }
  });

  it("returns early when AUTH_RESEND_KEY is missing", async () => {
    await sendLoginNotification("notify@example.com");

    expect(sendMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "AUTH_RESEND_KEY not configured, skipping login notification"
    );
  });

  it("sends with fallback sender when AUTH_EMAIL_FROM is missing", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";

    await sendLoginNotification("notify@example.com");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@example.com",
        to: "notify@example.com",
        subject: "New login to your account",
        html: expect.stringContaining("notify@example.com"),
      })
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { email: "notify@example.com" },
      "Login notification sent"
    );
  });

  it("uses AUTH_EMAIL_FROM when configured", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    process.env.AUTH_EMAIL_FROM = "security@cashier.example";

    await sendLoginNotification("notify@example.com");

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "security@cashier.example",
      })
    );
  });

  it("does not throw when resend send fails", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    const sendError = new Error("smtp down");
    sendMock.mockRejectedValueOnce(sendError);

    await expect(sendLoginNotification("notify@example.com")).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { error: sendError, email: "notify@example.com" },
      "Failed to send login notification"
    );
  });
});
