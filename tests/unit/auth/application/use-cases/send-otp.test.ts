import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOTPTokenMock,
  checkResendCooldownMock,
  checkSendRateLimitMock,
  checkSendRateLimitByIPMock,
  getCanResendAtMock,
  setResendCooldownMock,
  generateOTPMock,
  otpEmailMock,
  resendSendMock,
  loggerWarnMock,
  loggerInfoMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createOTPTokenMock: vi.fn(),
  checkResendCooldownMock: vi.fn(),
  checkSendRateLimitMock: vi.fn(),
  checkSendRateLimitByIPMock: vi.fn(),
  getCanResendAtMock: vi.fn(),
  setResendCooldownMock: vi.fn(),
  generateOTPMock: vi.fn(),
  otpEmailMock: vi.fn(),
  resendSendMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/modules/auth/repositories/otp-repository", () => ({
  createOTPToken: createOTPTokenMock,
}));

vi.mock("@/modules/auth/services/otp-rate-limit", () => ({
  checkResendCooldown: checkResendCooldownMock,
  checkSendRateLimit: checkSendRateLimitMock,
  checkSendRateLimitByIP: checkSendRateLimitByIPMock,
  getCanResendAt: getCanResendAtMock,
  setResendCooldown: setResendCooldownMock,
}));

vi.mock("@/modules/auth/services/otp", () => ({
  generateOTP: generateOTPMock,
}));

vi.mock("@/emails/otp-email", () => ({
  default: otpEmailMock,
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: resendSendMock,
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

import { RateLimitError } from "@/lib/errors";
import { sendOTP } from "@/modules/auth/application/use-cases/send-otp";

type SendOTPInput = Parameters<typeof sendOTP>[0];

function validEmail(email: string) {
  return email as SendOTPInput["email"];
}

describe("sendOTP use case", () => {
  const originalResendKey = process.env.AUTH_RESEND_KEY;
  const originalEmailFrom = process.env.AUTH_EMAIL_FROM;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.AUTH_EMAIL_FROM;

    createOTPTokenMock.mockResolvedValue({
      expiresAt: new Date(Date.now() + 300_000),
      success: true,
    });
    checkResendCooldownMock.mockResolvedValue({ allowed: true });
    checkSendRateLimitMock.mockResolvedValue({
      allowed: true,
      remainingAttempts: 9,
    });
    checkSendRateLimitByIPMock.mockResolvedValue({
      allowed: true,
      remainingAttempts: 9,
    });
    getCanResendAtMock.mockResolvedValue(1_234_567_890);
    setResendCooldownMock.mockResolvedValue(undefined);
    generateOTPMock.mockReturnValue("123456");
    otpEmailMock.mockReturnValue({ kind: "otp-email-component" });
    resendSendMock.mockResolvedValue({ id: "mail-id" });
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

  it("rejects when IP rate limit is exceeded", async () => {
    checkSendRateLimitByIPMock.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 120,
    });

    await expect(
      sendOTP({
        email: validEmail("test@example.com"),
        ip: "203.0.113.9",
        host: "cashier.example",
      })
    ).rejects.toThrow(RateLimitError);
  });

  it("passes host into OTPEmail and uses fallback AUTH_EMAIL_FROM", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";

    const result = await sendOTP({
      email: validEmail("User@Example.COM"),
      ip: "203.0.113.2",
      host: "cashier.example",
    });

    expect(createOTPTokenMock).toHaveBeenCalledWith("user@example.com", "123456", "203.0.113.2");
    expect(otpEmailMock).toHaveBeenCalledWith({
      otp: "123456",
      host: "cashier.example",
      expiresInMinutes: 5,
      locale: "zh",
      copy: expect.objectContaining({
        heading: "登录 cashier.example",
        codeLabel: "您的验证码：",
      }),
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Cashier <noreply@example.com>",
        to: "user@example.com",
        subject: "您的验证码是 123456",
        react: { kind: "otp-email-component" },
      })
    );
    expect(setResendCooldownMock).toHaveBeenCalledWith("user@example.com");
    expect(result.canResendAt).toBe(1_234_567_890);
  });

  it("throws user-facing error when resend send fails", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    resendSendMock.mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      sendOTP({
        email: validEmail("test@example.com"),
        ip: "127.0.0.1",
        host: "cashier.example",
      })
    ).rejects.toThrow("Failed to send verification code. Please try again.");

    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" }),
      "Failed to send OTP email"
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Failed to send verification code. Please try again.",
        }),
      }),
      "Send OTP use case error"
    );
  });

  it("builds a Chinese subject and localized OTP template props", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";

    await sendOTP({
      email: validEmail("user@example.com"),
      ip: "203.0.113.2",
      host: "cashier.example",
      locale: "zh",
    });

    expect(otpEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "cashier.example",
        locale: "zh",
        copy: expect.objectContaining({
          heading: "登录 cashier.example",
          codeLabel: "您的验证码：",
        }),
      })
    );
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "您的验证码是 123456",
      })
    );
  });

  it("supports custom AUTH_EMAIL_FROM", async () => {
    process.env.AUTH_RESEND_KEY = "resend-key";
    process.env.AUTH_EMAIL_FROM = "security@cashier.example";

    await sendOTP({
      email: validEmail("test@example.com"),
      ip: "127.0.0.1",
      host: "cashier.example",
    });

    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "security@cashier.example",
      })
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { email: "test@example.com" },
      "OTP email sent successfully"
    );
  });
});
