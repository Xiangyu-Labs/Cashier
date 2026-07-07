import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthLoginPage } from "@/modules/auth/ui/login-page";

vi.mock("@/modules/auth/hooks/use-login-flow", () => ({
  useLoginFlow: () => ({
    callbackUrl: "/",
    step: "email",
    mode: "otp",
    email: "",
    otp: "",
    password: "",
    isLoading: false,
    error: null,
    passwordError: null,
    isPasswordLoading: false,
    expiresAt: null,
    canResendAt: null,
    setEmail: vi.fn(),
    setOtp: vi.fn(),
    setPassword: vi.fn(),
    setMode: vi.fn(),
    handleSendOTP: vi.fn(),
    handleVerifyOTP: vi.fn(),
    handleResendOTP: vi.fn(),
    handleChangeEmail: vi.fn(),
    handleOTPExpired: vi.fn(),
    handlePasswordLogin: vi.fn(),
  }),
}));

describe("AuthLoginPage", () => {
  it("keeps inactive login method labels visible", () => {
    render(<AuthLoginPage />);

    const passwordMode = screen.getByRole("button", { name: "密码" });

    expect(passwordMode.className).not.toContain("text-transparent");
    expect(passwordMode.className).toContain("text-muted-foreground");
  });

  it("uses touch-sized login method controls", () => {
    render(<AuthLoginPage />);

    expect(screen.getByRole("button", { name: "邮箱登录" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: "密码" }).className).toContain("h-11");
  });
});
