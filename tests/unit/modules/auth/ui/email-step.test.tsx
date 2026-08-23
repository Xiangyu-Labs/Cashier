import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailStep } from "@/modules/auth/ui/email-step";

describe("EmailStep", () => {
  it("renders email OTP controls", () => {
    render(
      <EmailStep
        callbackUrl="/"
        email=""
        isLoading={false}
        error={null}
        onEmailChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
    expect(screen.getByRole("button", { name: "发送验证码" })).toBeEnabled();
  });
});
