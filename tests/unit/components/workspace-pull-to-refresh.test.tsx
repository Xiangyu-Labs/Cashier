import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  LedgerDto as Ledger,
  EntryCategoryDto as EntryCategory,
} from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";
import { queryKeys } from "@/lib/query-keys";
import { LedgerEntriesTab } from "@/modules/workspace/ui/LedgerEntriesTab";
import { DetailsTab } from "@/modules/workspace/ui/DetailsTab";
import { StatsTab } from "@/modules/workspace/ui/StatsTab";
import { asQueryLike } from "tests/helpers/react-query";

const pullToRefreshProps: Array<{ onRefresh: () => Promise<void> }> = [];

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh-CN",
  useFormatter: () => ({
    dateTime: () => "2026-03",
  }),
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({
    onRefresh,
    children,
  }: {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
  }) => {
    pullToRefreshProps.push({ onRefresh });
    return <div data-testid="pull-to-refresh">{children}</div>;
  },
}));

vi.mock("@/lib/store/modal-stack", () => ({
  useModalStackStore: (selector: (state: { push: typeof vi.fn }) => unknown) =>
    selector({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-layout-transition", () => ({
  useLayoutTransition: () => ({
    containerProps: {},
    getItemProps: () => ({}),
    layoutGroupId: "layout-group-id",
  }),
}));

vi.mock("@/hooks/use-selection", () => ({
  useSelection: ({ allIds }: { allIds: string[] }) => ({
    isSelectionMode: false,
    setSelectionMode: vi.fn(),
    selectedIds: [],
    toggleSelection: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    isAllSelected: allIds.length > 0,
  }),
}));

vi.mock("@/hooks/use-infinite-scroll", () => ({
  useInfiniteScroll: () => vi.fn(),
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useGroupedEntries: () => ({
    groupedCompletedByDate: [],
    allSourceDocumentIds: [],
  }),
  useLedgerEntriesMutations: () => ({
    updateEntry: { mutate: vi.fn() },
    deleteEntry: { mutate: vi.fn() },
  }),
  useDetailsTabData: () => ({
    entries: [],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    monthStats: {
      mainTotal: 0,
      mainCurrency: "CNY",
      hasMultipleCurrencies: false,
      breakdown: [],
    },
  }),
  useEntryMutations: () => ({
    updateEntry: { mutate: vi.fn() },
    deleteEntry: { mutate: vi.fn() },
  }),
  useBatchEntryActions: () => ({
    batchCategorize: { mutate: vi.fn(), isPending: false },
    batchChangeCategory: { mutate: vi.fn(), isPending: false },
    batchChangeCurrency: { mutate: vi.fn(), isPending: false },
    batchDelete: { mutate: vi.fn(), isPending: false },
  }),
  useDetailsTabGrouping: () => ({
    groupedItems: [],
  }),
}));

vi.mock("@/modules/source-document/hooks", () => ({
  useSourceDocumentCollection: () => ({
    groups: { completed: [], anomaly: [] },
    isLoading: false,
  }),
  useBatchSourceDocumentActions: () => ({
    deleteSourceDocument: { mutate: vi.fn() },
    batchUpdateDates: { mutate: vi.fn(), isPending: false },
    batchDelete: { mutate: vi.fn(), isPending: false },
    batchRetry: { mutate: vi.fn(), isPending: false },
  }),
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
    handleFiltersChange: () => vi.fn(),
  }),
}));

vi.mock("@/modules/workspace/ui/useLedgerEntriesTabState", () => ({
  useLedgerEntriesTabState: () => ({
    deleteConfirm: { open: false, id: null, type: null },
    setDeleteConfirm: vi.fn(),
    retrySourceDocument: null,
    setRetrySourceDocument: vi.fn(),
    openSourceDocumentDeleteConfirm: vi.fn(),
    closeDeleteConfirm: vi.fn(),
    closeRetrySourceDocument: vi.fn(),
  }),
}));

vi.mock("@/modules/ledger/ui", () => ({
  EntryFilterPanel: () => <div>EntryFilterPanel</div>,
  LedgerEntriesBatchActionToolbar: () => <div>LedgerEntriesBatchActionToolbar</div>,
  LedgerEntryCard: () => <div>LedgerEntryCard</div>,
  LedgerEntryDetailModal: () => <div>LedgerEntryDetailModal</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerEntriesToolbar", () => ({
  LedgerEntriesToolbar: () => <div>LedgerEntriesToolbar</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerEntriesLoading", () => ({
  LedgerEntriesLoading: () => <div>LedgerEntriesLoading</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerEntriesCompletedGroups", () => ({
  LedgerEntriesCompletedGroups: () => <div>LedgerEntriesCompletedGroups</div>,
}));

vi.mock("@/modules/workspace/ui/LedgerEntriesOverlays", () => ({
  LedgerEntriesOverlays: () => <div>LedgerEntriesOverlays</div>,
}));

vi.mock("@/modules/stats/ui", () => ({
  CalendarHeatmapSection: () => <div>CalendarHeatmapSection</div>,
  StatsChart: () => <div>StatsChart</div>,
  StatsHeader: () => <div>StatsHeader</div>,
  StatsRanking: () => <div>StatsRanking</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => <div>ConfirmDialog</div>,
}));

const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  metadata: {
    settings: {
      mainCurrency: "CNY",
      currencies: ["CNY"],
    },
  },
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  deletedAt: null,
};

const categories: EntryCategory[] = [];
const periodParams: PeriodParams = { period: "month" };

function renderWithClient(ui: React.ReactNode, queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("workspace tab pull-to-refresh regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullToRefreshProps.length = 0;
  });

  it("LedgerEntriesTab pull-to-refresh invalidates task queue", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithClient(
      <LedgerEntriesTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={periodParams}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
      />,
      queryClient
    );

    const refreshHandler = pullToRefreshProps[0]?.onRefresh;
    expect(refreshHandler).toBeTypeOf("function");
    if (refreshHandler == null) throw new Error("Expected refresh handler");

    await refreshHandler();

    const predicates = invalidateQueriesSpy.mock.calls
      .flatMap((call) => (call[0]?.predicate == null ? [] : [call[0].predicate]));
    const taskQueueMatched = predicates.some((predicate) =>
      predicate(asQueryLike(queryKeys.taskQueue("ledger-1")))
    );

    expect(taskQueueMatched).toBe(true);
  });

  it("DetailsTab pull-to-refresh invalidates task queue", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithClient(
      <DetailsTab
        ledgerId="ledger-1"
        categories={categories}
        ledger={ledger}
        periodParams={periodParams}
        onPeriodChange={vi.fn()}
        onFiltersChange={vi.fn()}
        advancedFilters={{}}
      />,
      queryClient
    );

    const refreshHandler = pullToRefreshProps[0]?.onRefresh;
    expect(refreshHandler).toBeTypeOf("function");
    if (refreshHandler == null) throw new Error("Expected refresh handler");

    await refreshHandler();

    const predicates = invalidateQueriesSpy.mock.calls
      .flatMap((call) => (call[0]?.predicate == null ? [] : [call[0].predicate]));
    const taskQueueMatched = predicates.some((predicate) =>
      predicate(asQueryLike(queryKeys.taskQueue("ledger-1")))
    );

    expect(taskQueueMatched).toBe(true);
  });

  it("StatsTab pull-to-refresh invalidates task queue", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithClient(<StatsTab ledgerId="ledger-1" ledger={ledger} />, queryClient);

    const refreshHandler = pullToRefreshProps[0]?.onRefresh;
    expect(refreshHandler).toBeTypeOf("function");
    if (refreshHandler == null) throw new Error("Expected refresh handler");

    await refreshHandler();

    const predicates = invalidateQueriesSpy.mock.calls
      .flatMap((call) => (call[0]?.predicate == null ? [] : [call[0].predicate]));
    const taskQueueMatched = predicates.some((predicate) =>
      predicate(asQueryLike(queryKeys.taskQueue("ledger-1")))
    );

    expect(taskQueueMatched).toBe(true);
  });
});
