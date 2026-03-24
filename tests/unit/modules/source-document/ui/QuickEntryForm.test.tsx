import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QuickEntryForm } from "@/modules/source-document/ui/QuickEntryForm";
import type { EntryCategory } from "@/modules/ledger/contracts";

const useQuickEntryFormControllerMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/source-document/hooks/useQuickEntryFormController", () => ({
  useQuickEntryFormController: useQuickEntryFormControllerMock,
}));

vi.mock("@/components/CategoryIcon", () => ({
  CategoryIcon: ({ iconName }: { iconName: string | null }) => (
    <span data-testid="category-icon">{iconName ?? "no-icon"}</span>
  ),
}));

vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="date-filter">{placeholder ?? "date-filter"}</div>
  ),
}));

vi.mock("@/components/ui/calculator-input", () => ({
  CalculatorInput: ({ value }: { value: number }) => <div data-testid="calculator-input">{value}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div data-testid="currency-select">{children}</div>,
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="currency-options">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid="currency-option" data-value={value}>
      {children}
    </div>
  ),
}));

function createCategory(overrides: Partial<EntryCategory> = {}): EntryCategory {
  return {
    id: "cat-1",
    ledgerId: "ledger-1",
    name: "Meals",
    description: null,
    icon: "utensils",
    sortOrder: 1,
    isEditable: true,
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("QuickEntryForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickEntryFormControllerMock.mockReturnValue({
      selectedCategoryId: null,
      setSelectedCategoryId: vi.fn(),
      selectedCategory: null,
      amount: 0,
      setAmount: vi.fn(),
      currency: "MYR",
      setCurrency: vi.fn(),
      itemName: "",
      setItemName: vi.fn(),
      entryDate: new Date("2026-03-24T00:00:00.000Z"),
      setEntryDate: vi.fn(),
      mutation: { isPending: false },
      handleSubmit: vi.fn(),
    });
  });

  it("renders currency selector with main currency first", () => {
    render(
      <QuickEntryForm
        ledgerId="ledger-1"
        categories={[createCategory()]}
        mainCurrency="MYR"
        preferredCurrencies={["USD", "CNY"]}
      />
    );

    expect(screen.getByText("货币")).toBeTruthy();

    const options = screen.getAllByTestId("currency-option").map((node) => node.textContent);
    expect(options.slice(0, 3)).toEqual(["MYR", "USD", "CNY"]);
  });
});
