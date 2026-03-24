import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminUnauthorizedState } from "@/modules/admin/ui/AdminUnauthorizedState";

vi.mock("@/i18n/routing", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminUnauthorizedState", () => {
  it("renders the forbidden copy and home CTA", () => {
    render(
      <AdminUnauthorizedState
        title="Access denied"
        description="Only super admins can access this area."
        ctaLabel="Back home"
      />
    );

    expect(screen.getByText("Access denied")).toBeTruthy();
    expect(screen.getByText("Only super admins can access this area.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back home" }).getAttribute("href")).toBe("/");
  });
});
