import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import { LedgerEntryCard } from "@/modules/ledger/ui/LedgerEntryCard";

const otherCategory: EntryCategory = {
  id: "cat-other",
  ledgerId: "ledger-1",
  name: "其他",
  description: null,
  icon: "Package",
  sortOrder: 9,
  isEditable: false,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

const mockEntry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: "cat-other",
  category: otherCategory,
  itemName: "神秘支出",
  amount: "100.00",
  currency: "CNY",
  convertedAmount: null,
  exchangeRate: null,
  description: null,
  sourceDocumentId: null,
  sourceDocument: null,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

describe("LedgerEntryCard - other category", () => {
  function renderWithQueryClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  }

  it("shows warning badge when category is non-editable", () => {
    renderWithQueryClient(
      <LedgerEntryCard ledgerEntry={mockEntry} categories={[otherCategory]} mainCurrency="CNY" />
    );

    expect(screen.getByText("未精确分类")).not.toBeNull();
  });

  it("does not show warning badge for normal categorized entries", () => {
    const normalCategory: EntryCategory = {
      ...otherCategory,
      id: "cat-food",
      name: "餐饮",
      isEditable: true,
    };
    const normalEntry: LedgerEntry = {
      ...mockEntry,
      categoryId: "cat-food",
      category: normalCategory,
    };

    renderWithQueryClient(
      <LedgerEntryCard ledgerEntry={normalEntry} categories={[normalCategory]} mainCurrency="CNY" />
    );

    expect(screen.queryByText("未精确分类")).toBeNull();
  });
});
