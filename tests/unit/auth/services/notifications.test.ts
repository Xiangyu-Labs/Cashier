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

import { render } from "@react-email/render";
import { sendLoginNotification as sendLoginNotificationWithPort } from "@/modules/auth/services/notifications";
import { serverComposition } from "@/application/server-composition-root";

const sendLoginNotification = (input: Parameters<typeof sendLoginNotificationWithPort>[0]) =>
  sendLoginNotificationWithPort(input, serverComposition.email);

describe("sendLoginNotification", () => {
  const originalResendKey = process.env.AUTH_RESEND_KEY;
  const originalEmailFrom = process.env.AUTH_EMAIL_FROM;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: { id: "mail-id" }, error: null });
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.AUTH_EMAIL_FROM;
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await sendLoginNotification({ email: "notify@example.com", locale: "zh" });

    expect(sendMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "AUTH_RESEND_KEY not configured, skipping login notification"
    );
  });

  it("renders localized login-notification content", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    const cases = [
      ["zh", "您的账户有新的登录", "检测到您的账户有新的登录", "登录时间"],
      ["en", "New sign-in to your account", "New sign-in detected", "Time:"],
    ] as const;

    for (const [locale, subject, heading, timeLabel] of cases) {
      sendMock.mockClear();
      await sendLoginNotification({ email: "notify@example.com", locale });

      const message = sendMock.mock.calls[0]?.[0];
      expect(message?.subject).toBe(subject);
      const rendered = await render(message?.react);
      expect(rendered).toContain(heading);
      expect(rendered).toContain(timeLabel);
    }
  });

  it("uses the configured sender and falls back when it is absent", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";

    await sendLoginNotification({ email: "notify@example.com", locale: "zh" });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Cashier <noreply@example.com>",
        to: "notify@example.com",
      })
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { subject: expect.stringMatching(/^email:[a-f0-9]{16}$/) },
      "Login notification sent"
    );
    sendMock.mockClear();
    process.env.AUTH_EMAIL_FROM = "security@cashier.example";

    await sendLoginNotification({ email: "notify@example.com", locale: "zh" });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "security@cashier.example",
      })
    );
  });

  it("absorbs provider failure responses without leaking delivery errors", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    const failures = [
      () => sendMock.mockRejectedValueOnce(new Error("smtp down")),
      () => sendMock.mockResolvedValueOnce({ data: null, error: { message: "rejected" } }),
      () => sendMock.mockResolvedValueOnce({ data: {}, error: null }),
    ];

    for (const arrangeFailure of failures) {
      loggerErrorMock.mockClear();
      arrangeFailure();
      await expect(
        sendLoginNotification({ email: "notify@example.com", locale: "zh" })
      ).resolves.toBeUndefined();
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringMatching(/^email:[a-f0-9]{16}$/) }),
        "Failed to send login notification"
      );
    }
  });

  it("stops waiting after five seconds and logs the timeout once", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    vi.useFakeTimers();
    sendMock.mockReturnValueOnce(new Promise(() => {}));

    const notification = sendLoginNotification({ email: "slow@example.com", locale: "en" });
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(notification).resolves.toBeUndefined();

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/^email:[a-f0-9]{16}$/) }),
      "Failed to send login notification"
    );
  });
});
