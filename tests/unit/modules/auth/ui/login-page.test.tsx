import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthLoginPage } from "@/modules/auth/ui/login-page";

vi.mock("@/modules/auth/hooks/use-login-flow", () => ({
  useLoginFlow: () => ({
    callbackUrl: "/",
    step: "email",
    email: "",
    otp: "",
    isLoading: false,
    error: null,
    expiresAt: null,
    canResendAt: null,
    setEmail: vi.fn(),
    setOtp: vi.fn(),
    handleSendOTP: vi.fn(),
    handleVerifyOTP: vi.fn(),
    handleResendOTP: vi.fn(),
    handleChangeEmail: vi.fn(),
    handleOTPExpired: vi.fn(),
  }),
}));

describe("AuthLoginPage", () => {
  it("renders email login only", () => {
    render(<AuthLoginPage />);

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "密码" })).not.toBeInTheDocument();
    expect(screen.queryByText("邮箱登录")).not.toBeInTheDocument();
  });
});
