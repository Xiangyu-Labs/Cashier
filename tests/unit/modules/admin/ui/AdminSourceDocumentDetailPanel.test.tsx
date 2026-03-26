import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminSourceDocumentDetail } from "@/modules/admin/contracts";
import {
  AdminSourceDocumentDetailPanel,
  type AdminSourceDocumentDetailPanelLabels,
} from "@/modules/admin/ui/AdminSourceDocumentDetailPanel";

const labels: AdminSourceDocumentDetailPanelLabels = {
  documentBasics: "Document basics",
  ledgerAndResults: "Ledger and results",
  content: "Content",
  timing: "Timing",
  rawData: "Raw data",
  showRawData: "Show raw data",
  hideRawData: "Hide raw data",
  sourceDocumentId: "Source Document ID",
  ledgerId: "Ledger ID",
  userEmail: "User Email",
  title: "Title",
  text: "Text",
  status: "Status",
  type: "Type",
  entryDate: "Entry Date",
  entryCount: "Entry Count",
  anomalyReason: "Anomaly Reason",
  createdAt: "Created At",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  metadata: "Metadata",
  imageUrls: "Image URLs",
  notAvailable: "—",
  statusQueued: "Queued",
  statusProcessing: "Processing",
  statusCompleted: "Completed",
  statusAnomaly: "Anomaly",
  statusFailed: "Failed",
  statusDeleted: "Deleted",
};

function createDetail(overrides: Partial<AdminSourceDocumentDetail> = {}): AdminSourceDocumentDetail {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    userEmail: "owner@example.com",
    title: "March lunch receipt",
    text: "Lunch total 18.50",
    imageUrls: ["https://example.com/receipt.png"],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: { provider: "openai", model: "gpt-5" },
    entryCount: 2,
    createdAt: new Date("2026-03-22T10:00:00.000Z"),
    updatedAt: new Date("2026-03-22T10:02:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("AdminSourceDocumentDetailPanel", () => {
  it("renders grouped sections covering all primary columns and helper fields", () => {
    render(
      <AdminSourceDocumentDetailPanel locale="en" detail={createDetail()} labels={labels} />
    );

    expect(screen.getByRole("heading", { name: "Document basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ledger and results" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Content" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Timing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Raw data" })).toBeTruthy();

    expect(screen.getByText("Source Document ID")).toBeTruthy();
    expect(screen.getByText("doc-1")).toBeTruthy();
    expect(screen.getByText("Ledger ID")).toBeTruthy();
    expect(screen.getByText("ledger-1")).toBeTruthy();
    expect(screen.getByText("User Email")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("March lunch receipt")).toBeTruthy();
    expect(screen.getByText("Lunch total 18.50")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("ai_parsed")).toBeTruthy();
    expect(screen.getByText("2026-03-20")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Created At")).toBeTruthy();
    expect(screen.getByText("Updated At")).toBeTruthy();
    expect(screen.getByText("Deleted At")).toBeTruthy();
  });

  it("keeps raw data collapsed by default and renders metadata/imageUrls through the raw-data block", () => {
    render(
      <AdminSourceDocumentDetailPanel locale="en" detail={createDetail()} labels={labels} />
    );

    expect(screen.getByRole("button", { name: "Show raw data" })).toBeTruthy();
    expect(screen.queryByText("Metadata")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show raw data" }));

    expect(screen.getByRole("button", { name: "Hide raw data" })).toBeTruthy();
    expect(screen.getByText("Metadata")).toBeTruthy();
    expect(screen.getByText("Image URLs")).toBeTruthy();

    const rawBlocks = screen.getAllByText((_, element) => element?.tagName === "PRE");
    expect(rawBlocks.some((node) => (node.textContent ?? "").includes('"provider": "openai"'))).toBe(true);
    expect(
      rawBlocks.some((node) =>
        (node.textContent ?? "").includes('"https://example.com/receipt.png"')
      )
    ).toBe(true);
  });

  it("renders nullable values with the not-available label and maps status labels correctly", () => {
    render(
      <AdminSourceDocumentDetailPanel
        locale="en"
        detail={createDetail({
          userEmail: null,
          title: null,
          text: null,
          anomalyReason: null,
          entryDate: null,
          status: "anomaly",
        })}
        labels={labels}
      />
    );

    expect(screen.getByText("Anomaly")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
