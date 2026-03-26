import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminSystemConfigList, type AdminSystemConfigListLabels } from "@/modules/admin/ui";
import type { AdminSystemConfigItem } from "@/modules/admin/contracts";

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

const labels: AdminSystemConfigListLabels = {
  title: "System Config",
  description: "Read-only visibility into effective config values.",
  readOnlyNotice: "Read-only for now.",
  name: "Name",
  tier: "Tier",
  source: "Source",
  required: "Required",
  value: "Value",
  descriptionColumn: "Description",
  emptyTitle: "No config rows",
  emptyDescription: "No config rows are currently available.",
  tierSystem: "System",
  tierRuntime: "Runtime",
  sourceEnvironment: "Environment",
  sourceDefault: "Default",
  sourceMissing: "Missing",
  requiredYes: "Yes",
  requiredNo: "No",
  notSet: "Not set",
};

const items: AdminSystemConfigItem[] = [
  {
    name: "DATABASE_URL",
    tier: "system",
    required: false,
    description: "SQLite database connection string.",
    value: "file:./data/sqlite.db",
    source: "default",
  },
  {
    name: "AUTH_SECRET",
    tier: "system",
    required: true,
    description: "Secret used for auth.",
    value: null,
    source: "missing",
  },
];

describe("AdminSystemConfigList", () => {
  it("renders the system-config table columns and read-only values", () => {
    render(<AdminSystemConfigList locale="en" items={items} labels={labels} />);

    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Tier" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Required" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Value" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Description" })).toBeTruthy();

    expect(screen.getByText("Read-only for now.")).toBeTruthy();
    expect(screen.getByText("Not set")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
    expect(screen.getByText("Missing")).toBeTruthy();
  });

  it("renders the empty state instead of a table when no items are available", () => {
    render(<AdminSystemConfigList locale="en" items={[]} labels={labels} />);

    expect(screen.getByRole("heading", { name: "No config rows" })).toBeTruthy();
    expect(screen.getByText("No config rows are currently available.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
