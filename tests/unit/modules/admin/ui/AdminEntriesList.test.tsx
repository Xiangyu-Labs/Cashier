import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminEntriesList, type AdminEntriesListLabels } from "@/modules/admin/ui/AdminEntriesList";
import type { AdminEntryDetail, AdminEntryListItem } from "@/modules/admin/contracts";
import type { AdminEntryFiltersState } from "@/modules/admin/ui/AdminEntryFilters";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const labels: AdminEntriesListLabels = {
  title: "Entries",
  description: "Read-only visibility into ledger entries.",
  createdAt: "Created At",
  user: "User",
  itemName: "Item",
  amount: "Amount",
  currency: "Currency",
  category: "Category",
  sourceDocument: "Source Document",
  details: "Details",
  detailsColumn: "Details",
  hideDetails: "Hide details",
  emptyTitle: "No entries yet",
  emptyDescription: "Ledger entries will appear here once documents are parsed or entries are created.",
  filteredEmptyTitle: "No entries match the current filters",
  filteredEmptyDescription: "Try clearing one or more filters.",
  nextPage: "Load older entries",
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
  descriptionLabel: "Description",
  convertedAmount: "Converted Amount",
  exchangeRate: "Exchange Rate",
  updatedAt: "Updated At",
  deletedAt: "Deleted At",
  notAvailable: "—",
};

const defaultFilters: AdminEntryFiltersState = {
  range: "30d",
  currency: "USD",
  categoryId: "category-1",
  sourceLink: "linked",
  limit: "50",
};

function createItem(overrides: Partial<AdminEntryListItem> = {}): AdminEntryListItem {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    userEmail: "owner@example.com",
    categoryId: "category-1",
    categoryName: "Meals",
    sourceDocumentId: "doc-1",
    amount: "18.50",
    currency: "USD",
    itemName: "Lunch",
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    ...overrides,
  };
}

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
    createdAt: new Date("2026-03-25T10:00:00.000Z"),
    updatedAt: new Date("2026-03-25T10:02:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("AdminEntriesList", () => {
  it("renders global and filtered empty states distinctly", () => {
    const { rerender } = render(
      <AdminEntriesList
        locale="en"
        items={[]}
        hasAnyEntries={false}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(screen.getByRole("heading", { name: "No entries yet" })).toBeTruthy();
    expect(
      screen.getByText("Ledger entries will appear here once documents are parsed or entries are created.")
    ).toBeTruthy();

    rerender(
      <AdminEntriesList
        locale="en"
        items={[]}
        hasAnyEntries={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(screen.getByRole("heading", { name: "No entries match the current filters" })).toBeTruthy();
    expect(screen.getByText("Try clearing one or more filters.")).toBeTruthy();
  });

  it("renders compact rows and expanded detail panels", () => {
    render(
      <AdminEntriesList
        locale="en"
        items={[createItem()]}
        hasAnyEntries={true}
        nextCursor={null}
        filters={defaultFilters}
        labels={labels}
        expandedEntryId="entry-1"
        expandedEntryDetail={createDetail()}
      />
    );

    expect(screen.getByRole("heading", { name: "Entries" })).toBeTruthy();
    expect(screen.getAllByText("Lunch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Meals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("doc-1").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Entry basics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Associations" })).toBeTruthy();
  });

  it("builds next-page and detail toggle links with preserved filters", () => {
    const item = createItem({ id: "entry-11111111" });

    const { rerender } = render(
      <AdminEntriesList
        locale="en"
        items={[item]}
        hasAnyEntries={true}
        nextCursor="2026-03-20T00:00:00.000Z|entry-99|2026-03-18T12:00:00.000Z"
        currentCursor="2026-03-21T00:00:00.000Z|entry-100"
        filters={defaultFilters}
        labels={labels}
      />
    );

    expect(screen.getByRole("link", { name: "Load older entries" }).getAttribute("href")).toBe(
      "/admin/entries?range=30d&currency=USD&categoryId=category-1&sourceLink=linked&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Centry-99%7C2026-03-18T12%3A00%3A00.000Z"
    );

    expect(screen.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(
      "/admin/entries?range=30d&currency=USD&categoryId=category-1&sourceLink=linked&limit=50&cursor=2026-03-21T00%3A00%3A00.000Z%7Centry-100&detail=entry-11111111"
    );

    rerender(
      <AdminEntriesList
        locale="en"
        items={[item]}
        hasAnyEntries={true}
        nextCursor={null}
        currentCursor="2026-03-21T00:00:00.000Z|entry-100"
        filters={defaultFilters}
        labels={labels}
        expandedEntryId="entry-11111111"
        expandedEntryDetail={createDetail({ id: "entry-11111111" })}
      />
    );

    expect(screen.getByRole("link", { name: "Hide details" }).getAttribute("href")).toBe(
      "/admin/entries?range=30d&currency=USD&categoryId=category-1&sourceLink=linked&limit=50&cursor=2026-03-21T00%3A00%3A00.000Z%7Centry-100"
    );
  });
});
