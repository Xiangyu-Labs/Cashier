import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { LedgerEntriesTab } from "./LedgerEntriesTab";
import type { EntryCategory, Ledger } from "@/types/api";

const mockInvalidateQueries = vi.fn(async () => undefined);
const mockGetLedgerStatsAction = vi.fn(async () => ({
  convertedTotal: { total: 321.45, currency: "CNY" },
  totals: [],
  trend: [],
  byCategory: [],
}));
const mockUseSourceDocuments = vi.fn();
const mockDeleteSourceDocumentMutate = vi.fn();
const mockBatchDeleteMutate = vi.fn();
const mockBatchRetryMutate = vi.fn();
const mockBatchUpdateDatesMutate = vi.fn();
const mockDeleteEntryMutate = vi.fn();
const mockPushModal = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
    useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
      queryFn().catch(() => undefined);
      return { data: { convertedTotal: { total: 321.45, currency: "CNY" } } };
    },
  };
});

vi.mock("@/modules/ledger/actions", () => ({
  getLedgerStatsAction: (...args: unknown[]) => mockGetLedgerStatsAction(...args),
}));

vi.mock("@/modules/source-document/hooks", () => ({
  useSourceDocuments: (...args: unknown[]) => mockUseSourceDocuments(...args),
  useBatchSourceDocumentActions: () => ({
    deleteSourceDocument: { mutate: mockDeleteSourceDocumentMutate, isPending: false },
    batchUpdateDates: { mutate: mockBatchUpdateDatesMutate, isPending: false },
    batchDelete: { mutate: mockBatchDeleteMutate, isPending: false },
    batchRetry: { mutate: mockBatchRetryMutate, isPending: false },
  }),
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useGroupedEntries: () => ({
    groupedCompletedByDate: [
      {
        title: "2026-03-18",
        total: 99,
        items: [
          {
            sourceDocument: {
              id: "doc-1",
              status: "completed",
              anomalyReason: null,
            },
            ledgerEntries: [],
          },
        ],
      },
    ],
    allSourceDocumentIds: ["doc-1", "doc-2"],
  }),
  useLedgerEntriesMutations: () => ({
    updateEntry: { mutate: vi.fn() },
    deleteEntry: { mutate: mockDeleteEntryMutate },
  }),
}));

vi.mock("@/hooks/use-selection", () => ({
  useSelection: () => ({
    isSelectionMode: true,
    setSelectionMode: vi.fn(),
    selectedIds: ["doc-1"],
    toggleSelection: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    isAllSelected: false,
  }),
}));

vi.mock("@/hooks/use-layout-transition", () => ({
  useLayoutTransition: () => ({
    containerProps: {},
    getItemProps: () => ({}),
    layoutGroupId: "layout-group",
  }),
}));

vi.mock("@/lib/store/modal-stack", () => ({
  useModalStackStore: (selector: (state: { push: (...args: unknown[]) => void }) => unknown) =>
    selector({ push: mockPushModal }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en-US",
}));

vi.mock("framer-motion", () => ({
  LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({
    onRefresh,
    children,
  }: {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
  }) => (
    <div>
      <button data-testid="refresh-trigger" onClick={() => void onRefresh()}>
        refresh
      </button>
      {children}
    </div>
  ),
}));

vi.mock("@/modules/ledger/ui", () => ({
  EntryFilterPanel: () => <div data-testid="entry-filter-panel" />,
}));

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentCard: ({
    sourceDocument,
    onDelete,
  }: {
    sourceDocument: { id: string };
    onDelete?: () => void;
  }) => (
    <div data-testid={`source-doc-${sourceDocument.id}`}>
      <button data-testid={`delete-${sourceDocument.id}`} onClick={() => onDelete?.()}>
        delete
      </button>
    </div>
  ),
  SourceDocumentEditRetryDialog: () => null,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <button data-testid="confirm-delete" onClick={onConfirm}>
        confirm
      </button>
    ) : null,
}));

vi.mock("@/components/batch-action-toolbar", () => ({
  BatchActionToolbar: ({
    selectedCount,
    totalCount,
  }: {
    selectedCount: number;
    totalCount: number;
  }) => (
    <div data-testid="batch-toolbar">
      selected:{selectedCount}-total:{totalCount}
    </div>
  ),
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

describe("LedgerEntriesTab orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSourceDocuments.mockReturnValue({
      groups: { completed: [], anomaly: [] },
      isLoading: false,
    });
  });

  it("keeps summary and source-document queries aligned to the same period range", async () => {
    render(
      <LedgerEntriesTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={{ period: "custom", startDate: "2026-03-01", endDate: "2026-03-31" }}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
      />
    );

    await waitFor(() => expect(mockGetLedgerStatsAction).toHaveBeenCalled());
    expect(mockUseSourceDocuments).toHaveBeenCalled();

    const statsCall = mockGetLedgerStatsAction.mock.calls[0];
    if (statsCall == null) throw new Error("Expected first getLedgerStatsAction call");
    expect(statsCall[1]).toBe("2026-03-01");
    expect(statsCall[2]).toBe("2026-03-31");

    const sourceDocumentsCall = mockUseSourceDocuments.mock.calls[0];
    if (sourceDocumentsCall == null) throw new Error("Expected first useSourceDocuments call");
    const options = sourceDocumentsCall[1] as {
      dateRange?: { start?: Date; end?: Date };
    };
    const start = options.dateRange?.start;
    const end = options.dateRange?.end;
    if (start == null || end == null) throw new Error("Expected date range start/end");
    expect(formatDateTimeForApi(start)).toBe("2026-03-01");
    expect(formatDateTimeForApi(end)).toBe("2026-03-31");
  });

  it("keeps refresh invalidation scope and delete confirm routing stable", async () => {
    mockUseSourceDocuments.mockReturnValue({
      groups: {
        completed: [
          {
            sourceDocument: { id: "doc-1", status: "completed", anomalyReason: null },
            ledgerEntries: [],
          },
        ],
        anomaly: [{ sourceDocument: { id: "doc-9" }, ledgerEntries: [] }],
      },
      isLoading: false,
    });

    render(
      <LedgerEntriesTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={{ period: "week" }}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("refresh-trigger"));
    await waitFor(() => expect(mockInvalidateQueries).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId("delete-doc-1"));
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(mockDeleteSourceDocumentMutate).toHaveBeenCalledWith("doc-1");
    expect(mockBatchDeleteMutate).not.toHaveBeenCalled();
    expect(mockDeleteEntryMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("batch-toolbar").textContent).toContain("selected:1-total:2");
  });
});
