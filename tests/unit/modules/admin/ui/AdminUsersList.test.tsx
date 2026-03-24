import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminUsersList } from "@/modules/admin/ui/AdminUsersList";
import { UserRole } from "@/modules/admin/types";

const labels = {
  title: "Users",
  description: "Manage who exists in the system.",
  email: "Email",
  name: "Name",
  role: "Role",
  createdAt: "Created",
  emptyTitle: "No users yet",
  emptyDescription: "Users will appear here after registration.",
  roleUser: "User",
  roleSuperAdmin: "Super Admin",
};

describe("AdminUsersList", () => {
  it("renders the empty state when there are no users", () => {
    render(<AdminUsersList locale="en" users={[]} labels={labels} />);

    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(screen.getByText("Users will appear here after registration.")).toBeTruthy();
  });

  it("renders rows and keeps null names visually empty", () => {
    const { container } = render(
      <AdminUsersList
        locale="en"
        users={[
          {
            id: "admin-user",
            email: "admin@example.com",
            name: "Owner",
            role: UserRole.SuperAdmin,
            createdAt: new Date("2026-03-21T10:00:00.000Z"),
          },
          {
            id: "plain-user",
            email: "plain@example.com",
            name: null,
            role: UserRole.User,
            createdAt: new Date("2026-03-20T10:00:00.000Z"),
          },
        ]}
        labels={labels}
      />
    );

    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Super Admin")).toBeTruthy();
    expect(screen.getByText("User")).toBeTruthy();
    expect(container.querySelectorAll("tbody td")[5]?.textContent).toBe("");
  });
});
