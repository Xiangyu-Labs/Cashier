import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DetailsTab } from "@/modules/workspace/ui/DetailsTab";
import type {
  EntryCategoryDto as EntryCategory,
  LedgerDto as Ledger,
} from "@/modules/ledger/contracts";

const mockSelectionToggleMode = vi.fn();
const mockSelectionClear = vi.fn();
const mockSelectionSetMode = vi.fn();
const mockSelectionSelectAll = vi.fn();
const mockSelectionState = {
  isAllSelected: false,
  selectedIds: ["entry-1"],
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(async () => undefined),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "BatchActions" && key === "selected") {
      return `selected:${String(values?.count ?? "")}`;
    }
    return key;
  },
  useLocale: () => "en-US",
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/lib/store/modal-stack", () => ({
  useModalStackStore: (selector: (state: { push: (...args: unknown[]) => void }) => unknown) =>
    selector({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-infinite-scroll", () => ({
  useInfiniteScroll: () => ({ current: null }),
}));

vi.mock("@/hooks/use-selection", () => ({
  useSelection: () => ({
    isSelectionMode: true,
    toggleSelectionMode: mockSelectionToggleMode,
    setSelectionMode: mockSelectionSetMode,
    selectedIds: mockSelectionState.selectedIds,
    toggleSelection: vi.fn(),
    selectAll: mockSelectionSelectAll,
    clearSelection: mockSelectionClear,
    isAllSelected: mockSelectionState.isAllSelected,
  }),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean | "indeterminate";
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="details-master-checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked ? "true" : "false"}
      onClick={() => onCheckedChange?.(!(checked === true))}
    />
  ),
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useDetailsTabData: () => ({
    entries: [
      {
        id: "entry-1",
        ledgerId: "ledger-1",
        itemName: "午餐",
        amount: "12.00",
        currency: "CNY",
      },
    ],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    monthStats: {
      mainCurrency: "CNY",
      mainTotal: 12,
    },
  }),
  useDetailsTabGrouping: () => ({
    groupedItems: [],
  }),
  useBatchEntryActions: () => ({
    batchCategorize: { mutate: vi.fn(), isPending: false },
    batchChangeCategory: { mutate: vi.fn(), isPending: false },
    batchChangeCurrency: { mutate: vi.fn(), isPending: false },
    batchDelete: { mutate: vi.fn(), isPending: false },
  }),
  useEntryMutations: () => ({
    updateEntry: { mutate: vi.fn() },
    deleteEntry: { mutate: vi.fn() },
  }),
}));

vi.mock("@/modules/ledger/ui", () => ({
  EntryFilterPanel: () => <div data-testid="entry-filter-panel" />,
  LedgerEntriesBatchActionToolbar: () => <div data-testid="batch-toolbar" />,
  LedgerEntryCard: () => <div data-testid="entry-card" />,
  LedgerEntryDetailModal: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/modules/workspace/ui/useDetailsTabState", () => ({
  useDetailsTabState: () => ({
    deleteConfirm: { open: false, id: null },
    setDeleteConfirm: vi.fn(),
    selectedLedgerEntry: null,
    setSelectedLedgerEntry: vi.fn(),
    isDetailModalOpen: false,
    setIsDetailModalOpen: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    handleViewEntry: vi.fn(),
    handleCloseDetail: vi.fn(),
  }),
}));

vi.mock("@/modules/workspace/ui/useDetailsTabFilters", () => ({
  useDetailsTabFilters: () => ({
    filters: {},
  }),
}));

const categories: EntryCategory[] = [];
const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  deletedAt: null,
  metadata: { settings: { mainCurrency: "CNY" } },
};

describe("DetailsTab selection toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectionState.isAllSelected = false;
    mockSelectionState.selectedIds = ["entry-1"];
  });

  it("uses the selection hook toggle when leaving multi-select mode", () => {
    render(
      <DetailsTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
        advancedFilters={{}}
      />
    );

    fireEvent.click(screen.getByTitle("cancelSelect"));

    expect(mockSelectionToggleMode).toHaveBeenCalledTimes(1);
    expect(mockSelectionClear).not.toHaveBeenCalled();
    expect(mockSelectionSetMode).not.toHaveBeenCalled();
  });

  it("shows a master checkbox and selected count in selection mode", () => {
    render(
      <DetailsTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
        advancedFilters={{}}
      />
    );

    fireEvent.click(screen.getByTestId("details-master-checkbox"));

    expect(mockSelectionSelectAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("batch-toolbar")).toBeNull();
    expect(screen.getByRole("button", { name: "aiCategorize" })).toBeTruthy();
    expect(screen.queryByTestId("entry-filter-panel")).toBeNull();
    expect(screen.getByText("selected:1")).toBeTruthy();
  });

  it("clears all loaded selection from the master checkbox when all loaded items are selected", () => {
    mockSelectionState.isAllSelected = true;

    render(
      <DetailsTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
        advancedFilters={{}}
      />
    );

    fireEvent.click(screen.getByTestId("details-master-checkbox"));

    expect(mockSelectionClear).toHaveBeenCalledTimes(1);
  });
});
