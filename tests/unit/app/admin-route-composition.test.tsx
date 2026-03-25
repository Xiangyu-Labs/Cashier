import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";
import type { AdminTaskListItem } from "@/modules/admin/contracts";

const { requireSuperAdminMock, listAdminUsersMock, listAdminTasksMock, redirectMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
  listAdminUsersMock: vi.fn(),
  listAdminTasksMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

vi.mock("@/modules/admin/queries", () => ({
  listAdminUsers: listAdminUsersMock,
  listAdminTasks: listAdminTasksMock,
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
  usePathname: () => "/en/admin/users",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: redirectMock,
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
    expect(redirectMock).toHaveBeenCalledWith("/api/auth/signout?callbackUrl=%2Fen%2Flogin");
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

  it("wires the tasks page to the admin query with normalized search params", async () => {
    const items: AdminTaskListItem[] = [
      {
        id: "task-1",
        status: "failed",
        type: "parse_source_document",
        title: "Parse source document",
        progress: null,
        error: "AI returned invalid JSON",
        scopeId: "ledger-1",
        scopeUserEmail: "owner@example.com",
        entityType: "source_document",
        entityId: "doc-1",
        createdAt: new Date("2026-03-22T10:00:00.000Z"),
        startedAt: new Date("2026-03-22T10:01:00.000Z"),
        completedAt: null,
      },
    ];

    listAdminTasksMock.mockResolvedValueOnce({
      items,
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;
    render(
      await TasksPage({
        searchParams: Promise.resolve({
          status: ["failed"],
          type: "parse_source_document",
          range: ["7d"],
          cursor: "2026-03-20T00:00:00.000Z|task-9",
          limit: ["25"],
        }),
      })
    );

    expect(listAdminTasksMock).toHaveBeenCalledWith({
      status: "failed",
      type: "parse_source_document",
      range: "7d",
      cursor: "2026-03-20T00:00:00.000Z|task-9",
      limit: "25",
    });
    expect(screen.getByText("Parse source document")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
  });
});
