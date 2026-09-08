import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailChangeForm } from "@/modules/auth/ui/EmailChangeForm";

const { sendCode, verifyCode } = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}));

vi.mock("@/modules/auth/server-actions/change-email", () => ({
  sendEmailChangeCodeAction: sendCode,
  verifyEmailChangeCodeAction: verifyCode,
}));

describe("EmailChangeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendCode.mockResolvedValue({ ok: true, expiresAt: Date.now() + 300_000, canResendAt: 0 });
    verifyCode.mockResolvedValue({ ok: true, email: "next@example.com" });
  });

  it("sends, resends, verifies, and resets the dialog draft when closed", async () => {
    const onChanged = vi.fn();
    render(<EmailChangeForm currentEmail="old@example.com" onChanged={onChanged} />);

    fireEvent.click(
      screen.getByRole("button", { name: /changeEmailButton|change email|修改邮箱/i })
    );
    const email = screen.getByLabelText(/newEmail|new email|新邮箱/i);
    fireEvent.change(email, { target: { value: "next@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /sendCode|send code|发送验证码/i }));
    await waitFor(() =>
      expect(sendCode).toHaveBeenCalledWith("next@example.com", expect.any(String))
    );

    fireEvent.click(screen.getByRole("button", { name: /resendCode|resend|重新发送/i }));
    await waitFor(() => expect(sendCode).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText(/verificationCode|6-digit|6 位/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verifyEmail|verify|验证/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("next@example.com"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /changeEmailButton|change email|修改邮箱/i })
    );
    expect(screen.getByLabelText(/newEmail|new email|新邮箱/i)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/newEmail|new email|新邮箱/i), {
      target: { value: "draft@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel|取消/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /changeEmailButton|change email|修改邮箱/i })
    );
    expect(screen.getByLabelText(/newEmail|new email|新邮箱/i)).toHaveValue("");
  });

  it("shows an error in the dialog when sending fails", async () => {
    sendCode.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    render(<EmailChangeForm currentEmail="old@example.com" />);
    fireEvent.click(
      screen.getByRole("button", { name: /changeEmailButton|change email|修改邮箱/i })
    );
    fireEvent.change(screen.getByLabelText(/newEmail|new email|新邮箱/i), {
      target: { value: "next@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sendCode|send code|发送验证码/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("prevents closing and duplicate submission while a request is pending", async () => {
    let resolveSend!: () => void;
    sendCode.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = () => resolve({ ok: true, expiresAt: Date.now() + 300_000, canResendAt: 0 });
      })
    );
    render(<EmailChangeForm currentEmail="old@example.com" />);
    fireEvent.click(
      screen.getByRole("button", { name: /changeEmailButton|change email|修改邮箱/i })
    );
    fireEvent.change(screen.getByLabelText(/newEmail|new email|新邮箱/i), {
      target: { value: "next@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sendCode|send code|发送验证码/i }));

    const cancel = screen.getByRole("button", { name: /cancel|取消/i });
    await waitFor(() => expect(cancel).toBeDisabled());
    expect(screen.getByLabelText(/newEmail|new email|新邮箱/i)).toBeDisabled();
    fireEvent.click(cancel);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sendCode).toHaveBeenCalledTimes(1);

    resolveSend();
    await waitFor(() => expect(cancel).not.toBeDisabled());
  });
});
