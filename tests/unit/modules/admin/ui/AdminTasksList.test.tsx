import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminTasksList,
  type AdminTaskFiltersState,
  type AdminTasksListLabels,
} from "@/modules/admin/ui/AdminTasksList";
import type { AdminTaskDetail, AdminTaskListItem } from "@/modules/admin/contracts";

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

function createTaskDetail(overrides: Partial<AdminTaskDetail> = {}): AdminTaskDetail {
  return {
    id: "task-1",
    status: "failed",
    type: "parse_source_document",
    title: "Parse source document",
    input: { sourceDocumentId: "doc-1" },
    deduplicationKey: "parse:doc-1",
    scopeId: "ledger-1",
    scopeUserEmail: "owner@example.com",
    entityType: "source_document",
    entityId: "doc-1",
    error: "AI returned invalid JSON from provider",
    progress: "25%",
    tokenUsage: { total: { input: 10, output: 20 } },
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    updatedAt: new Date("2026-03-25T10:02:00.000Z"),
    startedAt: new Date("2026-03-25T10:01:00.000Z"),
    completedAt: new Date("2026-03-25T10:10:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("AdminTasksList", () => {
  it("renders no-tasks empty state when there are no tasks at all", () => {
    render(
      <AdminTasksList
        locale="en"
        items={[]}
        hasAnyTasks={false}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedTaskId={null}
        expandedTaskDetail={null}
      />
    );

    expect(screen.getByRole("heading", { name: "No tasks yet" })).toBeTruthy();
    expect(
      screen.getByText("Background tasks will appear here once the system starts processing work.")
    ).toBeTruthy();
  });

  it("renders filtered-empty state when data exists but current filter returns no rows", () => {
    render(
      <AdminTasksList
        locale="en"
        items={[]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedTaskId={null}
        expandedTaskDetail={null}
      />
    );

    expect(screen.getByRole("heading", { name: "No tasks match the current filters" })).toBeTruthy();
    expect(screen.getByText("Try clearing one or more filters.")).toBeTruthy();
  });

  it("renders task rows and expands row details based on selected detail props", () => {
    const item = createTask({
      error: "AI returned invalid JSON from provider",
      progress: "25%",
      completedAt: new Date("2026-03-25T10:10:00.000Z"),
    });
    const detail = createTaskDetail();

    render(
      <AdminTasksList
        locale="en"
        items={[item]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedTaskId={item.id}
        expandedTaskDetail={detail}
      />
    );

    expect(screen.getByText("Parse source document")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("source_document:doc-1")).toBeTruthy();

    expect(screen.getByText("Task ID")).toBeTruthy();
    expect(screen.getAllByText("AI returned invalid JSON from provider").length).toBeGreaterThan(0);
    expect(screen.getByText("Progress")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("Scope ID")).toBeTruthy();
    expect(screen.getByText("ledger-1")).toBeTruthy();
    expect(screen.getByText("Entity Type")).toBeTruthy();
    expect(screen.getAllByText("source_document").length).toBeGreaterThan(0);
    expect(screen.getByText("Entity ID")).toBeTruthy();
    expect(screen.getByText("doc-1")).toBeTruthy();
    expect(screen.getByText("Started At")).toBeTruthy();
    expect(screen.getByText("Completed At")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("9m 0s")).toBeTruthy();
  });

  it("builds next-page link with existing filters and next cursor", () => {
    render(
      <AdminTasksList
        locale="en"
        items={[createTask()]}
        hasAnyTasks={true}
        nextCursor="2026-03-20T00:00:00.000Z|task-99|2026-03-18T12:00:00.000Z"
        filters={defaultFilters}
        labels={labels}
        expandedTaskId={null}
        expandedTaskDetail={null}
      />
    );

    const link = screen.getByRole("link", { name: "Load older tasks" });
    expect(link.getAttribute("href")).toBe(
      "/admin/tasks?status=failed&type=parse_source_document&range=7d&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Ctask-99%7C2026-03-18T12%3A00%3A00.000Z"
    );
  });

  it("renders duration using label-provided units instead of hard-coded English", () => {
    const customUnitLabels: AdminTasksListLabels = {
      ...labels,
      durationHoursUnit: "小时",
      durationMinutesUnit: "分",
      durationSecondsUnit: "秒",
    };

    const detail = createTaskDetail({
      startedAt: new Date("2026-03-25T10:00:00.000Z"),
      completedAt: new Date("2026-03-25T10:09:00.000Z"),
    });

    render(
      <AdminTasksList
        locale="zh"
        items={[
          createTask({
            startedAt: new Date("2026-03-25T10:00:00.000Z"),
            completedAt: new Date("2026-03-25T10:09:00.000Z"),
          }),
        ]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={customUnitLabels}
        expandedTaskId="task-1"
        expandedTaskDetail={detail}
      />
    );
    expect(screen.getByText("9分 0秒")).toBeTruthy();
  });

  it("builds details and hide-details links with current filters and current cursor", () => {
    render(
      <AdminTasksList
        locale="en"
        items={[createTask({ id: "11111111-1111-4111-8111-111111111111" })]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        currentCursor="2026-03-20T00:00:00.000Z|task-99"
        labels={labels}
        expandedTaskId={null}
        expandedTaskDetail={null}
      />
    );

    const detailsLink = screen.getByRole("link", { name: "Details" });
    expect(detailsLink.getAttribute("href")).toBe(
      "/admin/tasks?status=failed&type=parse_source_document&range=7d&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Ctask-99&detail=11111111-1111-4111-8111-111111111111"
    );

    const expandedDetail = createTaskDetail({ id: "11111111-1111-4111-8111-111111111111" });
    render(
      <AdminTasksList
        locale="en"
        items={[createTask({ id: "11111111-1111-4111-8111-111111111111" })]}
        hasAnyTasks={true}
        nextCursor={null}
        filters={defaultFilters}
        currentCursor="2026-03-20T00:00:00.000Z|task-99"
        labels={labels}
        expandedTaskId="11111111-1111-4111-8111-111111111111"
        expandedTaskDetail={expandedDetail}
      />
    );

    const hideDetailsLink = screen.getByRole("link", { name: "Hide details" });
    expect(hideDetailsLink.getAttribute("href")).toBe(
      "/admin/tasks?status=failed&type=parse_source_document&range=7d&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Ctask-99"
    );
  });
});
