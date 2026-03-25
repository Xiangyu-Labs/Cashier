import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/modules/admin/ui/AdminShell";

const usePathnameMock = vi.fn(() => "/en/admin/users");

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
  usePathname: () => usePathnameMock(),
}));

describe("AdminShell", () => {
  it("renders the admin header, navigation, and content", () => {
    render(
      <AdminShell
        kicker="Internal"
        title="Admin"
        description="Back office"
        navItems={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/tasks", label: "Tasks" },
        ]}
      >
        <div>Admin content</div>
      </AdminShell>
    );

    expect(screen.getByText("Internal")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("Back office")).toBeTruthy();
    expect(screen.getByText("Admin content")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Tasks" })).toBeTruthy();
  });
});
