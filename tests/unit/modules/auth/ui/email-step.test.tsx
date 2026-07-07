import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailStep } from "@/modules/auth/ui/email-step";

vi.mock("@/lib/env/public", () => ({
  publicEnv: {
    appUrl: "http://localhost:3000",
    oidcEnabled: true,
    oidcButtonName: "Cashier SSO",
  },
}));

describe("EmailStep", () => {
  it("does not render SSO controls even when old OIDC env is present", () => {
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
    expect(screen.queryByText("或使用以下方式")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cashier SSO" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SSO 登录" })).not.toBeInTheDocument();
  });
});
