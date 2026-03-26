import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminTasksList, type AdminTasksListLabels } from "@/modules/admin/ui";
import type { AdminTaskListItem } from "@/modules/admin/contracts";

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

const labels: AdminTasksListLabels = {
  title: "Tasks",
  description: "Task history",
  createdAt: "Created At",
  status: "Status",
  type: "Type",
  task: "Task",
  scope: "Scope",
  entity: "Entity",
  details: "Details",
  detailsColumn: "Details",
  hideDetails: "Hide details",
  taskId: "Task ID",
  scopeId: "Scope ID",
  entityType: "Entity Type",
  entityId: "Entity ID",
  startedAt: "Started At",
  completedAt: "Completed At",
  duration: "Duration",
  durationHoursUnit: "h",
  durationMinutesUnit: "m",
  durationSecondsUnit: "s",
  progress: "Progress",
  error: "Error",
  emptyTitle: "No tasks",
  emptyDescription: "No tasks yet",
  filteredEmptyTitle: "No filtered tasks",
  filteredEmptyDescription: "Try clearing filters",
  nextPage: "Next page",
  statusPending: "Pending",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
  input: "Input",
  deduplicationKey: "Deduplication Key",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  tokenUsage: "Token Usage",
  taskBasics: "Task basics",
  scopeAndEntity: "Scope and entity",
  timing: "Timing",
  execution: "Execution",
  rawData: "Raw data",
  showRawData: "Show raw data",
  hideRawData: "Hide raw data",
  scopeUserEmail: "Scope user email",
  notAvailable: "—",
};

const items: AdminTaskListItem[] = [
  {
    id: "task-1",
    status: "failed",
    type: "parse_source_document",
    title: "Parse document",
    progress: null,
    error: "Bad OCR",
    scopeId: "ledger-1",
    scopeUserEmail: "user@example.com",
    entityType: "source_document",
    entityId: "doc-1",
    createdAt: new Date("2026-03-26T10:00:00.000Z"),
    startedAt: null,
    completedAt: null,
  },
];

describe("AdminTasksList", () => {
  it("renders the details action in its own column instead of inside the task summary cell", () => {
    render(
      <AdminTasksList
        locale="en"
        items={items}
        hasAnyTasks={true}
        nextCursor={null}
        filters={{ range: "all" }}
        labels={labels}
      />
    );

    expect(screen.getByRole("columnheader", { name: "Details" })).toBeTruthy();

    const taskTitle = screen.getByText("Parse document");
    const taskCell = taskTitle.closest("td");
    expect(taskCell?.textContent).not.toContain("Details");

    const detailsLink = screen.getByRole("link", { name: "Details" });
    const detailsCell = detailsLink.closest("td");
    expect(detailsCell?.textContent).toContain("Details");
  });
});
