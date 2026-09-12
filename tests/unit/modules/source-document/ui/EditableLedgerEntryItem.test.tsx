import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { EditableLedgerEntryItem } from "@/modules/source-document/ui/EditableLedgerEntryItem";

const amountDisplay = vi.hoisted(() => ({
  current: {
    converted: null as string | null,
    displayAmount: "18.00",
    isDifferentCurrency: false,
    status: "idle" as "idle" | "success",
    isLoading: false,
    isError: false,
    originalCurrency: "CNY",
    mainCurrency: "CNY",
  },
}));

vi.mock("@/modules/currency/hooks/useAmountDisplay", () => ({
  useAmountDisplay: () => amountDisplay.current,
}));

const entry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: null,
  sourceDocumentId: "doc-1",
  amount: "18.00",
  currency: "CNY",
  itemName: "早餐",
  description: null,
  convertedAmount: "18.00",
  exchangeRate: "1",
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  deletedAt: null,
};

function renderItem(readOnly: boolean) {
  return render(
    <EditableLedgerEntryItem
      ledgerEntry={entry}
      categories={[]}
      categoryPlaceholder="选择分类"
      originalEntryDate="2026-09-10"
      readOnly={readOnly}
    />
  );
}

describe("EditableLedgerEntryItem currency control", () => {
  beforeEach(() => {
    amountDisplay.current = {
      converted: null,
      displayAmount: "18.00",
      isDifferentCurrency: false,
      status: "idle",
      isLoading: false,
      isError: false,
      originalCurrency: "CNY",
      mainCurrency: "CNY",
    };
  });

  it("shows the amount as plain, undimmed text when read-only", () => {
    renderItem(true);

    const amount = screen.getByText("¥18.00");
    expect(amount).toHaveClass("text-text");
    expect(amount).not.toHaveClass("opacity-50");
    expect(screen.queryByRole("button", { name: "货币" })).not.toBeInTheDocument();
  });

  it("exposes the currency dropdown only in the editable state", () => {
    renderItem(false);

    expect(screen.getByRole("button", { name: "货币" })).toBeInTheDocument();
  });

  it("stacks the converted amount above the original, like the stream rows", () => {
    amountDisplay.current = {
      converted: "72.00",
      displayAmount: "72.00",
      isDifferentCurrency: true,
      status: "success",
      isLoading: false,
      isError: false,
      originalCurrency: "USD",
      mainCurrency: "CNY",
    };
    renderItem(true);

    const converted = screen.getByText("¥72.00");
    expect(converted).toHaveClass("text-base", "font-semibold", "text-text");

    // The original amount is named by its currency code alone: the row already
    // reads as a converted one, so no "≈" marks the figure below.
    const original = screen.getByText((text) => text.startsWith("USD"));
    expect(original).toHaveClass("text-xs", "text-muted-foreground");
    expect(original.textContent).toContain("USD");
    expect(original.textContent).not.toContain("≈");

    // The original sits below the converted amount.
    expect(
      converted.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
