import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLoginFlow } from "@/app/[locale]/login/hooks/use-login-flow";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignIn = vi.fn();
const mockVerifyOTPAction = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/features/auth/server-actions", () => ({
  sendOTPAction: vi.fn(),
  verifyOTPAction: (...args: unknown[]) => mockVerifyOTPAction(...args),
  OTP_LENGTH: 6,
}));

describe("useLoginFlow", () => {
  const t = (key: string) => {
    const messages: Record<string, string> = {
      registrationDisabledDesc: "当前系统不允许新用户注册，请联系管理员获取账号。",
      errorDesc: "登录过程中发生错误，请重试。",
      unexpectedError: "发生意外错误",
    };

    return messages[key] ?? key;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOTPAction.mockResolvedValue({ email: "new-user@example.com" });
  });

  it("shows the registration-disabled message for the custom credentials error code", async () => {
    mockSignIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "registration_disabled",
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

  it("shows a generic message for other credentials sign-in failures", async () => {
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
});
