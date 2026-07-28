import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="currency-select">{children}</div>
  ),
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
      amount: "",
      setAmount: vi.fn(),
      currency: "MYR",
      setCurrency: vi.fn(),
      itemName: "",
      setItemName: vi.fn(),
      entryDate: "2026-03-24",
      setEntryDate: vi.fn(),
      mutation: { isPending: false },
      handleSubmit: vi.fn(),
    });
  });

  it("renders currency selector with main currency first", () => {
    const { container } = render(
      <QuickEntryForm
        ledgerId="ledger-1"
        categories={[createCategory()]}
        mainCurrency="MYR"
        preferredCurrencies={["USD", "CNY"]}
      />
    );

    expect(screen.getByText("货币")).toBeTruthy();
    const amountInput = screen.getByRole("textbox", { name: "金额" });
    expect(amountInput).toHaveAttribute("inputmode", "decimal");
    expect(amountInput).toHaveAttribute("placeholder", "0.00");
    expect(screen.getAllByText("MYR")).toHaveLength(2);

    const options = screen.getAllByTestId("currency-option").map((node) => node.textContent);
    expect(options.slice(0, 3)).toEqual(["MYR", "USD", "CNY"]);

    const itemNameInput = container.querySelector("input[placeholder='名称（可选）']");
    const labels = Array.from(container.querySelectorAll("p")).map((node) => ({
      text: node.textContent,
      node,
    }));
    const dateLabel = labels.find((label) => label.text === "选择日期")?.node ?? null;
    const categoryLabel = labels.find((label) => label.text === "选择分类")?.node ?? null;
    const currencyLabel = labels.find((label) => label.text === "货币")?.node ?? null;

    expect(itemNameInput).not.toBeNull();
    expect(dateLabel).not.toBeNull();
    expect(categoryLabel).not.toBeNull();
    expect(currencyLabel).not.toBeNull();
    if (itemNameInput == null) {
      throw new Error("Expected item name input");
    }
    if (dateLabel == null || categoryLabel == null || currencyLabel == null) {
      throw new Error("Expected ordered quick entry labels");
    }

    expect(itemNameInput.compareDocumentPosition(dateLabel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(dateLabel.compareDocumentPosition(categoryLabel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(categoryLabel.compareDocumentPosition(currencyLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(currencyLabel.compareDocumentPosition(amountInput)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("accepts a decimal amount with at most two fractional digits", () => {
    const setAmount = vi.fn();
    useQuickEntryFormControllerMock.mockReturnValue({
      ...useQuickEntryFormControllerMock(),
      setAmount,
    });

    render(<QuickEntryForm ledgerId="ledger-1" categories={[createCategory()]} />);
    const amountInput = screen.getByRole("textbox", { name: "金额" });

    fireEvent.change(amountInput, { target: { value: "12.34" } });
    fireEvent.change(amountInput, { target: { value: "12.345" } });

    expect(setAmount).toHaveBeenCalledTimes(1);
    expect(setAmount).toHaveBeenCalledWith("12.34");
  });
});
