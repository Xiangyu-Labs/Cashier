import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminUsersList } from "@/modules/admin/ui/AdminUsersList";
import { UserRole } from "@/modules/admin/types";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
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
  notAvailable: "—",
  profile: "Profile",
  timestamps: "Timestamps",
};

describe("AdminUsersList", () => {
  it("renders the empty state when there are no users", () => {
    render(<AdminUsersList locale="en" users={[]} labels={labels} />);

    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(screen.getByText("Users will appear here after registration.")).toBeTruthy();
  });

  it("renders rows and keeps null names visually empty", () => {
    const expectedCreatedAt = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date("2026-03-21T10:00:00.000Z"));

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

    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Super Admin")).toBeTruthy();
    expect(screen.getByText("User")).toBeTruthy();
    expect(screen.getByText(expectedCreatedAt)).toBeTruthy();
    expect(container.querySelectorAll("tbody td")[6]?.textContent).toBe("");
  });
});
