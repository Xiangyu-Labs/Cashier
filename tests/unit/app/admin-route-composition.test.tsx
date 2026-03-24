import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock, listAdminUsersMock, redirectMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
  listAdminUsersMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

vi.mock("@/modules/admin/queries", () => ({
  listAdminUsers: listAdminUsersMock,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespaceArg: { namespace: string } | string) => {
    const keyspace =
      typeof namespaceArg === "string" ? namespaceArg : namespaceArg.namespace;
    return (key: string) => `${keyspace}.${key}`;
  },
  getLocale: async () => "en",
}));

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
  redirect: redirectMock,
  usePathname: () => "/en/admin/users",
}));

describe("admin route composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the unauthorized state when the admin gate throws ForbiddenError", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new ForbiddenError("Forbidden"));
    const Layout = (await import("@/app/[locale]/(protected)/admin/layout")).default;

    render(await Layout({ children: <div>secret</div> }));

    expect(screen.getByText("AdminUnauthorized.title")).toBeTruthy();
  });

  it("redirects to login when the session user no longer resolves in the database", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(
      new UnauthorizedError("User not found in database")
    );
    const Layout = (await import("@/app/[locale]/(protected)/admin/layout")).default;

    const result = await Layout({ children: <div>secret</div> });

    expect(result).toBeNull();
    expect(redirectMock).toHaveBeenCalledWith({ href: "/login", locale: "en" });
  });

  it("wires the users page to the admin query and list component", async () => {
    listAdminUsersMock.mockResolvedValueOnce([
      {
        id: "admin-user",
        email: "admin@example.com",
        name: "Owner",
        role: UserRole.SuperAdmin,
        createdAt: new Date("2026-03-21T10:00:00.000Z"),
      },
    ]);

    const UsersPage = (await import("@/app/[locale]/(protected)/admin/users/page")).default;
    render(await UsersPage());

    expect(screen.getByText("admin@example.com")).toBeTruthy();
  });
});
