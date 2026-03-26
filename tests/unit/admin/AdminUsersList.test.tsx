import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminUsersList, type AdminUsersListLabels } from "@/modules/admin/ui";
import type { AdminUserListItem } from "@/modules/admin/contracts";

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const labels: AdminUsersListLabels = {
  title: "Users",
  description: "System users",
  email: "Email",
  name: "Name",
  role: "Role",
  createdAt: "Created At",
  details: "Details",
  detailsColumn: "Details",
  hideDetails: "Hide details",
  userId: "User ID",
  emailVerified: "Email Verified",
  image: "Image",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  emptyTitle: "No users",
  emptyDescription: "No users yet",
  roleUser: "User",
  roleSuperAdmin: "Super admin",
  notAvailable: "—",
};

const users: AdminUserListItem[] = [
  {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    emailVerified: new Date("2026-03-25T10:00:00.000Z"),
    image: "https://example.com/avatar.png",
    role: "super_admin",
    createdAt: new Date("2026-03-20T10:00:00.000Z"),
    updatedAt: new Date("2026-03-24T10:00:00.000Z"),
    deletedAt: null,
  },
];

describe("AdminUsersList", () => {
  it("renders full user columns in an expanded details panel with a dedicated details column", () => {
    render(
      <AdminUsersList locale="en" users={users} expandedUserId="user-1" labels={labels} />
    );

    expect(screen.getByRole("columnheader", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hide details" })).toBeTruthy();

    expect(screen.getByText("User ID")).toBeTruthy();
    expect(screen.getByText("Email Verified")).toBeTruthy();
    expect(screen.getByText("Image")).toBeTruthy();
    expect(screen.getByText("Updated At")).toBeTruthy();
    expect(screen.getByText("Deleted At")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();
    expect(screen.getByText("https://example.com/avatar.png")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
