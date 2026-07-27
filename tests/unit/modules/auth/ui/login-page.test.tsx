import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUseLoginFlow = vi.hoisted(() =>
  vi.fn(() => ({
    callbackUrl: "/",
    mode: "password",
    step: "email",
    email: "",
    password: "",
    otp: "",
    isLoading: false,
    error: null,
    expiresAt: null,
    canResendAt: null,
    isDevAuthAvailable: false,
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setOtp: vi.fn(),
    setMode: vi.fn(),
    handlePasswordLogin: vi.fn(),
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
  it("renders password login by default", async () => {
    const { AuthLoginPage } = await import("@/modules/auth/ui/login-page");
    render(<AuthLoginPage />);

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "邮箱验证码" })).not.toBeInTheDocument();
    expect(screen.getByText("密码登录")).toBeInTheDocument();
  });

  it("offers OTP as an optional mode only when email delivery is enabled", async () => {
    const { AuthLoginPage } = await import("@/modules/auth/ui/login-page");
    render(<AuthLoginPage emailAuthEnabled />);

    expect(screen.getByRole("tab", { name: "密码" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "邮箱验证码" })).toBeInTheDocument();
  });

  it("renders the development sign-in action only when enabled", async () => {
    mockUseLoginFlow.mockReturnValue({
      callbackUrl: "/",
      mode: "password",
      step: "email",
      email: "",
      password: "",
      otp: "",
      isLoading: false,
      error: null,
      expiresAt: null,
      canResendAt: null,
      isDevAuthAvailable: true,
      setEmail: vi.fn(),
      setPassword: vi.fn(),
      setOtp: vi.fn(),
      setMode: vi.fn(),
      handlePasswordLogin: vi.fn(),
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
