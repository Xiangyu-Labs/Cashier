import { render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminTasksList,
  type AdminTaskFiltersState,
  type AdminTasksListLabels,
} from "@/modules/admin/ui/AdminTasksList";
import type { AdminTaskListItem } from "@/modules/admin/contracts";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const labels: AdminTasksListLabels = {
  title: "Tasks",
  description: "Read-only visibility into backend task history.",
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
  emptyTitle: "No tasks yet",
  emptyDescription: "Background tasks will appear here once the system starts processing work.",
  filteredEmptyTitle: "No tasks match the current filters",
  filteredEmptyDescription: "Try clearing one or more filters.",
  nextPage: "Load older tasks",
  statusPending: "Pending",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
  taskBasics: "Task basics",
  scopeAndEntity: "Scope and entity",
  timing: "Timing",
  execution: "Execution",
  rawData: "Raw data",
  showRawData: "Show raw data",
  hideRawData: "Hide raw data",
  input: "Input",
  deduplicationKey: "Deduplication Key",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  tokenUsage: "Token Usage",
  scopeUserEmail: "Scope User Email",
  notAvailable: "-",
};

const defaultFilters: AdminTaskFiltersState = {
  status: "failed",
  type: "parse_source_document",
  range: "7d",
  limit: "50",
};

function createTask(overrides: Partial<AdminTaskListItem> = {}): AdminTaskListItem {
  return {
    id: "task-1",
    status: "failed",
    type: "parse_source_document",
    title: "Parse source document",
    progress: null,
    error: "Summary error text",
    scopeId: "ledger-1",
    scopeUserEmail: "owner@example.com",
    entityType: "source_document",
    entityId: "doc-1",
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    startedAt: new Date("2026-03-25T10:01:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

describe("AdminTasksList", () => {
  it("uses a compact fixed table layout without a task summary column so details stays visible", () => {
    const longItem = createTask({
      title: "Categorize: Claude Code subscription",
      scopeUserEmail: "xiangyu.moe.ac@gmail.com",
      entityType: "entry",
      entityId: "6a4ab260-fa47-4fbd-af8b-4c7e470c57d7",
    });

    render(
      <AdminTasksList
        locale="en"
        items={[longItem]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedTaskId={null}
        expandedTaskDetail={null}
      />
    );

    const table = screen.getByRole("table");
    expect(table.className).toContain("w-full");
    expect(table.className).toContain("table-fixed");
    expect(within(table).queryByRole("columnheader", { name: "Task" })).toBeNull();

    const scopeCell = screen.getByText("xiangyu.moe.ac@gmail.com").closest("td");
    expect(scopeCell?.className).toContain("break-all");

    const entityCell = screen.getByText("entry:6a4ab260-fa47-4fbd-af8b-4c7e470c57d7").closest("td");
    expect(entityCell?.className).toContain("break-all");
  });
});
