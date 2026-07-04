import type React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/modules/admin/types";
import { AdminUsersList } from "@/modules/admin/ui/AdminUsersList";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const labels = {
  title: "Users",
  description: "Manage who exists in the system.",
  email: "Email",
  name: "Name",
  role: "Role",
  createdAt: "Created",
  details: "Details",
  detailsColumn: "Details",
  hideDetails: "Hide details",
  userId: "User ID",
  emailVerified: "Email Verified",
  image: "Image",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  emptyTitle: "No users yet",
  emptyDescription: "Users will appear here after registration.",
  roleUser: "User",
  roleSuperAdmin: "Super Admin",
  notAvailable: "-",
  profile: "Profile",
  timestamps: "Timestamps",
};

describe("AdminUsersList", () => {
  it("keeps null names visually empty in the row grid", () => {
    const { container } = render(
      <AdminUsersList
        locale="en"
        users={[
          {
            id: "admin-user",
            email: "admin@example.com",
            name: "Owner",
            emailVerified: new Date("2026-03-22T10:00:00.000Z"),
            image: "https://example.com/avatar.png",
            role: UserRole.SuperAdmin,
            createdAt: new Date("2026-03-21T10:00:00.000Z"),
            updatedAt: new Date("2026-03-23T10:00:00.000Z"),
            deletedAt: null,
          },
          {
            id: "plain-user",
            email: "plain@example.com",
            name: null,
            emailVerified: null,
            image: null,
            role: UserRole.User,
            createdAt: new Date("2026-03-20T10:00:00.000Z"),
            updatedAt: new Date("2026-03-20T12:00:00.000Z"),
            deletedAt: null,
          },
        ]}
        labels={labels}
      />
    );

    expect(container.querySelectorAll("tbody td")[6]?.textContent).toBe("");
  });
});
