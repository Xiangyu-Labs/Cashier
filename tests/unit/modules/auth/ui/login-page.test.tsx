import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUseLoginFlow = vi.hoisted(() =>
  vi.fn(() => ({
    callbackUrl: "/",
    step: "email",
    email: "",
    otp: "",
    isLoading: false,
    error: null,
    expiresAt: null,
    canResendAt: null,
    isDevAuthAvailable: false,
    setEmail: vi.fn(),
    setOtp: vi.fn(),
    handleSendOTP: vi.fn(),
    handleVerifyOTP: vi.fn(),
    handleResendOTP: vi.fn(),
    handleChangeEmail: vi.fn(),
    handleOTPExpired: vi.fn(),
    handleDevSignIn: vi.fn(),
  }))
);

vi.mock("@/modules/auth/hooks/use-login-flow", () => ({
  useLoginFlow: mockUseLoginFlow,
}));

describe("AuthLoginPage", () => {
  it("renders email login only", async () => {
    const { AuthLoginPage } = await import("@/modules/auth/ui/login-page");
    render(<AuthLoginPage />);

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "密码" })).not.toBeInTheDocument();
    expect(screen.getByText("邮箱登录")).toBeInTheDocument();
  });

  it("renders the development sign-in action only when enabled", async () => {
    mockUseLoginFlow.mockReturnValue({
      callbackUrl: "/",
      step: "email",
      email: "",
      otp: "",
      isLoading: false,
      error: null,
      expiresAt: null,
      canResendAt: null,
      isDevAuthAvailable: true,
      setEmail: vi.fn(),
      setOtp: vi.fn(),
      handleSendOTP: vi.fn(),
      handleVerifyOTP: vi.fn(),
      handleResendOTP: vi.fn(),
      handleChangeEmail: vi.fn(),
      handleOTPExpired: vi.fn(),
      handleDevSignIn: vi.fn(),
    });

    const { AuthLoginPage } = await import("@/modules/auth/ui/login-page");
    render(<AuthLoginPage />);

    expect(screen.getByRole("button", { name: "以开发身份进入" })).toBeInTheDocument();
  });

  it("presents Cashier as a quiet app entry instead of a marketing page", async () => {
    const { AuthLoginPage } = await import("@/modules/auth/ui/login-page");
    render(<AuthLoginPage />);

    expect(screen.getByRole("heading", { name: "Cashier" })).toBeInTheDocument();
    expect(screen.getByText("一个安静的个人账本")).toBeInTheDocument();
  });
});
