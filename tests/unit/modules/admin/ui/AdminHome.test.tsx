import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminHome } from "@/modules/admin/ui/AdminHome";

describe("AdminHome", () => {
  it("renders the localized intro copy", () => {
    render(<AdminHome title="Admin overview" description="Manage internal tools and users." />);

    expect(screen.getByText("Admin overview")).toBeTruthy();
    expect(screen.getByText("Manage internal tools and users.")).toBeTruthy();
  });
});
