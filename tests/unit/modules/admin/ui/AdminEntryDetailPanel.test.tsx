import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminEntryDetail } from "@/modules/admin/contracts";
import {
  AdminEntryDetailPanel,
  type AdminEntryDetailPanelLabels,
} from "@/modules/admin/ui/AdminEntryDetailPanel";

const labels: AdminEntryDetailPanelLabels = {
  entryBasics: "Entry basics",
  associations: "Associations",
  amounts: "Amounts",
  timing: "Timing",
  entryId: "Entry ID",
  ledgerId: "Ledger ID",
  userEmail: "User Email",
  categoryId: "Category ID",
  categoryName: "Category Name",
  sourceDocumentId: "Source Document ID",
  sourceDocumentTitle: "Source Document Title",
  sourceDocumentStatus: "Source Document Status",
  amount: "Amount",
  currency: "Currency",
  itemName: "Item Name",
  description: "Description",
  convertedAmount: "Converted Amount",
  exchangeRate: "Exchange Rate",
  createdAt: "Created At",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  notAvailable: "—",
};

function createDetail(overrides: Partial<AdminEntryDetail> = {}): AdminEntryDetail {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    userEmail: "owner@example.com",
    categoryId: "category-1",
    categoryName: "Meals",
    sourceDocumentId: "doc-1",
    sourceDocumentTitle: "March lunch receipt",
    sourceDocumentStatus: "completed",
    amount: "18.50",
    currency: "USD",
    itemName: "Lunch",
    description: "Team lunch",
    convertedAmount: "18.50",
    exchangeRate: "1.00",
    createdAt: new Date("2026-03-22T10:00:00.000Z"),
    updatedAt: new Date("2026-03-22T10:02:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("AdminEntryDetailPanel", () => {
  it("renders grouped sections covering ledger-entry raw columns and helper fields", () => {
    render(<AdminEntryDetailPanel locale="en" detail={createDetail()} labels={labels} />);

    expect(screen.getByRole("heading", { name: "Entry basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Associations" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Amounts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Timing" })).toBeTruthy();

    expect(screen.getByText("Entry ID")).toBeTruthy();
    expect(screen.getByText("entry-1")).toBeTruthy();
    expect(screen.getAllByText("ledger-1").length).toBeGreaterThan(0);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("category-1")).toBeTruthy();
    expect(screen.getByText("Meals")).toBeTruthy();
    expect(screen.getByText("doc-1")).toBeTruthy();
    expect(screen.getByText("March lunch receipt")).toBeTruthy();
    expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("18.50").length).toBeGreaterThan(0);
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(screen.getByText("Team lunch")).toBeTruthy();
    expect(screen.getByText("1.00")).toBeTruthy();
    expect(screen.getByText("Created At")).toBeTruthy();
    expect(screen.getByText("Updated At")).toBeTruthy();
    expect(screen.getByText("Deleted At")).toBeTruthy();
  });

  it("renders nullable conversion and source fields with the not-available label", () => {
    render(
      <AdminEntryDetailPanel
        locale="en"
        detail={createDetail({
          userEmail: null,
          categoryId: null,
          categoryName: null,
          sourceDocumentId: null,
          sourceDocumentTitle: null,
          sourceDocumentStatus: null,
          currency: null,
          description: null,
          convertedAmount: null,
          exchangeRate: null,
        })}
        labels={labels}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
