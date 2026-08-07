import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordForm } from "@/modules/auth/ui/PasswordForm";

const { changePassword, setPassword } = vi.hoisted(() => ({
  changePassword: vi.fn(),
  setPassword: vi.fn(),
}));

vi.mock("@/modules/auth/actions", () => ({
  changePasswordAction: changePassword,
  setPasswordAction: setPassword,
}));

describe("PasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks the dialog and all mutually exclusive controls while saving", async () => {
    let resolveSave!: () => void;
    setPassword.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<PasswordForm hasPassword={false} passwordUpdatedAt={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: /setPasswordButton|set password|设置密码/i })
    );
    fireEvent.change(screen.getByLabelText(/newPassword|new password|新密码/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.change(screen.getByLabelText(/confirmPassword|confirm password|确认密码/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /savePassword|save password|保存密码/i }));

    const cancel = screen.getByRole("button", { name: /cancel|取消/i });
    await waitFor(() => expect(cancel).toBeDisabled());
    expect(screen.getByLabelText(/newPassword|new password|新密码/i)).toBeDisabled();
    for (const toggle of screen.getAllByLabelText(/showPassword|show password|显示密码/i)) {
      expect(toggle).toBeDisabled();
    }
    fireEvent.click(cancel);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(setPassword).toHaveBeenCalledTimes(1);

    resolveSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
