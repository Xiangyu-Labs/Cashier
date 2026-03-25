import { fireEvent, render, screen } from "@testing-library/react";
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
  notAvailable: "—",
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

  it("renders task rows and expanded full-record panel from selected detail props", () => {
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

    expect(screen.getAllByText("Parse source document").length).toBeGreaterThan(0);
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("source_document:doc-1")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Task basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Scope and entity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Timing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Execution" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Raw data" })).toBeTruthy();
    expect(screen.getByText("Updated At")).toBeTruthy();
    expect(screen.getByText("Deleted At")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show raw data" })).toBeTruthy();

    expect(screen.queryByText('{\n  "sourceDocumentId": "doc-1"\n}')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show raw data" }));
    const rawPre = screen.getByText((_, element) => element?.tagName === 'PRE' && (element.textContent ?? '').includes('\"sourceDocumentId\": \"doc-1\"'));
    expect(rawPre).toBeTruthy();
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
