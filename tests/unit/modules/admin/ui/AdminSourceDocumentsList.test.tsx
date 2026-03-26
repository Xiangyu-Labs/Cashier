import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSourceDocumentsList,
  type AdminSourceDocumentsListLabels,
} from "@/modules/admin/ui/AdminSourceDocumentsList";
import type { AdminSourceDocumentDetail, AdminSourceDocumentListItem } from "@/modules/admin/contracts";
import type { AdminSourceDocumentFiltersState } from "@/modules/admin/ui/AdminSourceDocumentFilters";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const labels: AdminSourceDocumentsListLabels = {
  title: "Source documents",
  description: "Read-only visibility into ingested source documents.",
  createdAt: "Created At",
  status: "Status",
  type: "Type",
  user: "User",
  sourceDocument: "Source Document",
  results: "Results",
  entryCount: "Entry Count",
  entryDate: "Entry Date",
  details: "Details",
  detailsColumn: "Details",
  hideDetails: "Hide details",
  emptyTitle: "No source documents yet",
  emptyDescription: "Uploaded source documents will appear here.",
  filteredEmptyTitle: "No source documents match the current filters",
  filteredEmptyDescription: "Try clearing one or more filters.",
  nextPage: "Load older documents",
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
  titleLabel: "Title",
  text: "Text",
  anomalyReason: "Anomaly Reason",
  metadata: "Metadata",
  imageUrls: "Image URLs",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  notAvailable: "—",
  statusQueued: "Queued",
  statusProcessing: "Processing",
  statusCompleted: "Completed",
  statusAnomaly: "Anomaly",
  statusFailed: "Failed",
  statusDeleted: "Deleted",
};

const defaultFilters: AdminSourceDocumentFiltersState = {
  status: "completed",
  type: "ai_parsed",
  range: "7d",
  result: "withEntries",
  limit: "50",
};

function createItem(overrides: Partial<AdminSourceDocumentListItem> = {}): AdminSourceDocumentListItem {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    userEmail: "owner@example.com",
    title: "March lunch receipt",
    status: "completed",
    type: "ai_parsed",
    entryDate: "2026-03-20",
    entryCount: 2,
    anomalyReason: null,
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    updatedAt: new Date("2026-03-25T10:02:00.000Z"),
    ...overrides,
  };
}

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
    metadata: { provider: "openai" },
    entryCount: 2,
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    updatedAt: new Date("2026-03-25T10:02:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("AdminSourceDocumentsList", () => {
  it("renders global and filtered empty states distinctly", () => {
    const { rerender } = render(
      <AdminSourceDocumentsList
        locale="en"
        items={[]}
        hasAnySourceDocuments={false}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(screen.getByRole("heading", { name: "No source documents yet" })).toBeTruthy();
    expect(screen.getByText("Uploaded source documents will appear here.")).toBeTruthy();

    rerender(
      <AdminSourceDocumentsList
        locale="en"
        items={[]}
        hasAnySourceDocuments={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(
      screen.getByRole("heading", { name: "No source documents match the current filters" })
    ).toBeTruthy();
    expect(screen.getByText("Try clearing one or more filters.")).toBeTruthy();
  });

  it("renders scan-friendly rows and expanded detail panels from selected detail props", () => {
    render(
      <AdminSourceDocumentsList
        locale="en"
        items={[createItem()]}
        hasAnySourceDocuments={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedSourceDocumentId="doc-1"
        expandedSourceDocumentDetail={createDetail()}
      />
    );

    expect(screen.getByRole("heading", { name: "Source documents" })).toBeTruthy();
    expect(screen.getAllByText("March lunch receipt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("2026-03-20")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Document basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Raw data" })).toBeTruthy();
  });

  it("builds next-page and detail toggle links with preserved filters", () => {
    const item = createItem({ id: "doc-11111111" });

    const { rerender } = render(
      <AdminSourceDocumentsList
        locale="en"
        items={[item]}
        hasAnySourceDocuments={true}
        nextCursor="2026-03-20T00:00:00.000Z|doc-99|2026-03-18T12:00:00.000Z"
        currentCursor="2026-03-21T00:00:00.000Z|doc-100"
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(screen.getByRole("link", { name: "Load older documents" }).getAttribute("href")).toBe(
      "/admin/source-documents?status=completed&type=ai_parsed&range=7d&result=withEntries&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Cdoc-99%7C2026-03-18T12%3A00%3A00.000Z"
    );

    expect(screen.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(
      "/admin/source-documents?status=completed&type=ai_parsed&range=7d&result=withEntries&limit=50&cursor=2026-03-21T00%3A00%3A00.000Z%7Cdoc-100&detail=doc-11111111"
    );

    rerender(
      <AdminSourceDocumentsList
        locale="en"
        items={[item]}
        hasAnySourceDocuments={true}
        nextCursor={null}
        currentCursor="2026-03-21T00:00:00.000Z|doc-100"
        filters={defaultFilters}
        labels={labels}
        expandedSourceDocumentId="doc-11111111"
        expandedSourceDocumentDetail={createDetail({ id: "doc-11111111" })}
      />
    );

    expect(screen.getByRole("link", { name: "Hide details" }).getAttribute("href")).toBe(
      "/admin/source-documents?status=completed&type=ai_parsed&range=7d&result=withEntries&limit=50&cursor=2026-03-21T00%3A00%3A00.000Z%7Cdoc-100"
    );
  });
});
