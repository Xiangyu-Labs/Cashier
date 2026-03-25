import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminTaskDetail } from "@/modules/admin/contracts";
import {
  AdminTaskDetailPanel,
  type AdminTaskDetailPanelLabels,
} from "@/modules/admin/ui/AdminTaskDetailPanel";

const labels: AdminTaskDetailPanelLabels = {
  taskBasics: "Task basics",
  scopeAndEntity: "Scope and entity",
  timing: "Timing",
  execution: "Execution",
  rawData: "Raw data",
  showRawData: "Show raw data",
  hideRawData: "Hide raw data",
  taskId: "Task ID",
  status: "Status",
  type: "Type",
  task: "Task",
  scopeId: "Scope ID",
  entityType: "Entity Type",
  entityId: "Entity ID",
  deduplicationKey: "Deduplication Key",
  scopeUserEmail: "Scope User Email",
  createdAt: "Created At",
  updatedAt: "Updated At",
  startedAt: "Started At",
  completedAt: "Completed At",
  deletedAt: "Deleted At",
  duration: "Duration",
  progress: "Progress",
  error: "Error",
  input: "Input",
  tokenUsage: "Token Usage",
  notAvailable: "—",
  durationHoursUnit: "h",
  durationMinutesUnit: "m",
  durationSecondsUnit: "s",
  statusPending: "Pending",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
};

function createDetail(overrides: Partial<AdminTaskDetail> = {}): AdminTaskDetail {
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
    error: "AI returned invalid JSON",
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

describe("AdminTaskDetailPanel", () => {
  it("renders grouped sections and derived helper fields", () => {
    render(<AdminTaskDetailPanel locale="en" detail={createDetail()} labels={labels} />);

    expect(screen.getByRole("heading", { name: "Task basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Scope and entity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Timing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Execution" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Raw data" })).toBeTruthy();

    expect(screen.getByText("Task ID")).toBeTruthy();
    expect(screen.getByText("task-1")).toBeTruthy();
    expect(screen.getByText("Scope User Email")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("9m 0s")).toBeTruthy();
  });

  it("keeps raw data collapsed by default and reveals blocks on toggle", () => {
    render(<AdminTaskDetailPanel locale="en" detail={createDetail()} labels={labels} />);

    expect(screen.getByRole("button", { name: "Show raw data" })).toBeTruthy();
    expect(screen.queryByText("Input")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show raw data" }));

    expect(screen.getByRole("button", { name: "Hide raw data" })).toBeTruthy();
    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("Token Usage")).toBeTruthy();
    const inputBlock = screen.getByText('Input').closest('div');
    expect(inputBlock?.textContent).toContain('\"sourceDocumentId\": \"doc-1\"');
  });

  it("renders scalar empty and null values with the not-available symbol", () => {
    render(
      <AdminTaskDetailPanel
        locale="en"
        detail={createDetail({
          deduplicationKey: null,
          scopeUserEmail: null,
          progress: "",
          error: null,
          startedAt: null,
          completedAt: null,
        })}
        labels={labels}
      />
    );

    expect(screen.getByText("Deduplication Key")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders raw empty states according to JSON rules", () => {
    const { rerender } = render(
      <AdminTaskDetailPanel
        locale="en"
        detail={createDetail({ input: undefined as unknown, tokenUsage: null })}
        labels={labels}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Show raw data" }));
    expect(screen.getByText("null")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    rerender(
      <AdminTaskDetailPanel
        locale="en"
        detail={createDetail({ input: "", tokenUsage: {} })}
        labels={labels}
      />
    );
    expect(screen.getByText('""')).toBeTruthy();
    expect(screen.getByText("{}")).toBeTruthy();
  });
});
