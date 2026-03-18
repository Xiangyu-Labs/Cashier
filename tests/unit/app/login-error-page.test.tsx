import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginErrorPage from "@/app/[locale]/login/error/page";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LoginErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the registration-disabled copy for the custom credentials error code", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "error") return "CredentialsSignin";
      if (key === "code") return AUTH_ERROR_CODES.REGISTRATION_DISABLED;
      return null;
    });

    render(<LoginErrorPage />);

    expect(screen.getByText("注册功能已关闭")).toBeTruthy();
    expect(screen.getByText("当前系统不允许新用户注册，请联系管理员获取账号。")).toBeTruthy();
  });

  it("shows OTP-specific copy for known credentials error codes", () => {
    const cases = [
      [AUTH_ERROR_CODES.OTP_INVALID, "登录出错", "验证码无效"],
      [AUTH_ERROR_CODES.OTP_EXPIRED, "登录出错", "验证码已过期，请重新获取。"],
      [AUTH_ERROR_CODES.OTP_LOCKED, "请求过于频繁", "验证码尝试次数过多，请稍后再试。"],
      [AUTH_ERROR_CODES.OTP_RATE_LIMITED, "请求过于频繁", "请等待一分钟后再试。"],
    ] as const;

    for (const [code, title, description] of cases) {
      mockGet.mockImplementation((key: string) => {
        if (key === "error") return "CredentialsSignin";
        if (key === "code") return code;
        return null;
      });

      const { unmount } = render(<LoginErrorPage />);

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(description)).toBeTruthy();
      unmount();
    }
  });

  it("falls back to the default error copy for unknown credentials errors", () => {
    mockGet.mockImplementation((key: string) => {
      if (key === "error") return "CredentialsSignin";
      if (key === "code") return "credentials";
      return null;
    });

    render(<LoginErrorPage />);

    expect(screen.getByText("登录出错")).toBeTruthy();
    expect(screen.getByText("登录过程中发生错误，请重试。")).toBeTruthy();
  });
});
