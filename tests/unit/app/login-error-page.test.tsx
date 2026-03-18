import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginErrorPage from "@/app/[locale]/login/error/page";

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
      if (key === "code") return "registration_disabled";
      return null;
    });

    render(<LoginErrorPage />);

    expect(screen.getByText("注册功能已关闭")).toBeTruthy();
    expect(screen.getByText("当前系统不允许新用户注册，请联系管理员获取账号。")).toBeTruthy();
  });

  it("falls back to the default error copy for other credentials errors", () => {
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
