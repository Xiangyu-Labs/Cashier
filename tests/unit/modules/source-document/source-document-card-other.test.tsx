import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

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
  sourceDocumentId: "doc-1",
  sourceDocument: null,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

const mockSourceDocument: SourceDocument = {
  id: "doc-1",
  ledgerId: "ledger-1",
  title: "测试单据",
  text: null,
  imageUrls: [],
  status: "completed",
  type: "ai_parsed",
  anomalyReason: null,
  entryDate: "2024-01-01",
  metadata: {},
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
  hasImages: false,
};

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

describe("SourceDocumentCard - other category entry", () => {
  it("renders LedgerEntryItem with warning variant when entry category is non-editable", () => {
    const { container } = renderWithQueryClient(
      <SourceDocumentCard
        sourceDocument={mockSourceDocument}
        ledgerEntries={[mockEntry]}
        mainCurrency="CNY"
        status="completed"
        anomalyReason={null}
        defaultExpanded
      />
    );

    expect(container.querySelector(".border-warning\\/20")).not.toBeNull();
  });

  it("does not render warning variant for normal categorized entries", () => {
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

    const { container } = renderWithQueryClient(
      <SourceDocumentCard
        sourceDocument={mockSourceDocument}
        ledgerEntries={[normalEntry]}
        mainCurrency="CNY"
        status="completed"
        anomalyReason={null}
        defaultExpanded
      />
    );

    expect(container.querySelector(".border-warning\\/20")).toBeNull();
  });
});
