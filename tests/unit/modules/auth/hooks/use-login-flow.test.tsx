import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLoginFlow } from "@/modules/auth/hooks/use-login-flow";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const { mockPush, mockRefresh, mockSignIn, mockSendOTPAction, searchParamGet } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockSignIn: vi.fn(),
  mockSendOTPAction: vi.fn(),
  searchParamGet: vi.fn((_key: string) => null as string | null),
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: searchParamGet,
  }),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/modules/auth/actions", () => ({
  sendOTPAction: (...args: unknown[]) => mockSendOTPAction(...args),
}));

describe("useLoginFlow", () => {
  const t = (key: string) => {
    const messages: Record<string, string> = {
      registrationDisabledDesc: "当前系统不允许新用户注册，请联系管理员获取账号。",
      errorDesc: "登录过程中发生错误，请重试。",
      unexpectedError: "发生意外错误",
      verifyFailed: "验证码无效",
      codeExpiredMessage: "验证码已过期，请重新获取。",
      otpLockedDesc: "验证码尝试次数过多，请稍后再试。",
      rateLimitedDesc: "请等待一分钟后再试。",
    };

    return messages[key] ?? key;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamGet.mockImplementation((_key: string) => null);
    mockSendOTPAction.mockResolvedValue({ expiresAt: 123, canResendAt: 456 });
  });

  it("shows the registration-disabled message for the custom credentials error code", async () => {
    mockSignIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: AUTH_ERROR_CODES.REGISTRATION_DISABLED,
      ok: false,
      status: 401,
      url: null,
    });

    const { result } = renderHook(() => useLoginFlow(t));

    act(() => {
      result.current.setEmail("new-user@example.com");
      result.current.setOtp("123456");
    });

    await act(async () => {
      await result.current.handleVerifyOTP();
    });

    expect(result.current.error).toBe("当前系统不允许新用户注册，请联系管理员获取账号。");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("maps OTP-specific error codes to localized messages", async () => {
    const cases = [
      [AUTH_ERROR_CODES.OTP_INVALID, "验证码无效"],
      [AUTH_ERROR_CODES.OTP_EXPIRED, "验证码已过期，请重新获取。"],
      [AUTH_ERROR_CODES.OTP_LOCKED, "验证码尝试次数过多，请稍后再试。"],
      [AUTH_ERROR_CODES.OTP_RATE_LIMITED, "请等待一分钟后再试。"],
    ] as const;

    for (const [code, message] of cases) {
      mockSignIn.mockResolvedValueOnce({
        error: "CredentialsSignin",
        code,
        ok: false,
        status: 401,
        url: null,
      });

      const { result } = renderHook(() => useLoginFlow(t));

      act(() => {
        result.current.setEmail("existing@example.com");
        result.current.setOtp("123456");
      });

      await act(async () => {
        await result.current.handleVerifyOTP();
      });

      expect(result.current.error).toBe(message);
    }
  });

  it("shows a generic message for unknown credentials sign-in failures", async () => {
    mockSignIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "credentials",
      ok: false,
      status: 401,
      url: null,
    });

    const { result } = renderHook(() => useLoginFlow(t));

    act(() => {
      result.current.setEmail("existing@example.com");
      result.current.setOtp("123456");
    });

    await act(async () => {
      await result.current.handleVerifyOTP();
    });

    expect(result.current.error).toBe("登录过程中发生错误，请重试。");
    expect(result.current.error).not.toBe("CredentialsSignin");
  });

  it("submits sign-in directly and redirects on success", async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: "/",
    });

    const { result } = renderHook(() => useLoginFlow(t));

    act(() => {
      result.current.setEmail("existing@example.com");
      result.current.setOtp("123456");
    });

    await act(async () => {
      await result.current.handleVerifyOTP();
    });

    expect(mockSignIn).toHaveBeenCalledWith("otp", {
      email: "existing@example.com",
      otp: "123456",
      locale: "zh",
      redirect: false,
      callbackUrl: "/",
    });
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("sanitizes unsafe callbackUrl values before sign-in and redirect", async () => {
    searchParamGet.mockImplementation((key: string) => {
      if (key === "callbackUrl") {
        return "https://evil.example/phish";
      }
      return null;
    });

    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: "/",
    });

    const { result } = renderHook(() => useLoginFlow(t));

    act(() => {
      result.current.setEmail("existing@example.com");
      result.current.setOtp("123456");
    });

    await act(async () => {
      await result.current.handleVerifyOTP();
    });

    expect(mockSignIn).toHaveBeenCalledWith("otp", {
      email: "existing@example.com",
      otp: "123456",
      locale: "zh",
      redirect: false,
      callbackUrl: "/",
    });
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockRefresh).toHaveBeenCalled();
  });
});
