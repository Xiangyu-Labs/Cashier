import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LedgerPageClient } from "./LedgerPageClient";

const replaceLedgerUrlMock = vi.hoisted(() => vi.fn());
const useLedgerTabsMock = vi.hoisted(() => vi.fn());
const usePeriodFilterMock = vi.hoisted(() => vi.fn());
const useDrilldownNavigationMock = vi.hoisted(() => vi.fn());
const useLedgerDialogStateMock = vi.hoisted(() => vi.fn());
const useLedgerPagePrefetchingMock = vi.hoisted(() => vi.fn());
const useTaskQueueMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=details"),
}));

vi.mock("@/i18n/routing", () => ({
  usePathname: () => "/ledger/ledger-1",
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const text = String(loader);
    const createComponent = (
      testId: string,
      content: string,
      clickHandler?: (props: Record<string, unknown>) => void
    ) => {
      const Component = (props: Record<string, unknown>) => (
        <div
          data-testid={testId}
          {...(clickHandler
            ? {
                onClick: () => clickHandler(props),
              }
            : {})}
        >
          {content}
        </div>
      );
      Component.displayName = `Mock${testId}`;
      return Component;
    };

    if (text.includes("DetailsTab")) {
      return createComponent("details-tab-trigger-filters", "details-tab", (props) => {
        const onAdvancedFiltersChange = props.onAdvancedFiltersChange as
          | ((value: unknown) => void)
          | undefined;
        onAdvancedFiltersChange?.({ categoryId: "cat-1" });
      });
    }

    if (text.includes("TaskQueueModal")) {
      const Component = ({ open }: { open: boolean }) => (
        <div data-testid="task-queue-modal">{open ? "open" : "closed"}</div>
      );
      Component.displayName = "MockTaskQueueModal";
      return Component;
    }

    if (text.includes("SourceDocumentInput")) {
      return createComponent("source-document-input", "input");
    }

    if (text.includes("QuickEntryForm")) {
      return createComponent("quick-entry-form", "quick");
    }

    if (text.includes("LedgerEntriesTab")) {
      return createComponent("ledger-entries-tab", "stream-tab");
    }

    if (text.includes("StatsTab")) {
      return createComponent("stats-tab", "stats-tab");
    }

    if (text.includes("/modules/ledger/ui")) {
      return createComponent("settings-tab", "settings-tab");
    }

    return createComponent("dynamic-generic", "dynamic");
  },
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      <button data-testid="tab-change-details" onClick={() => onValueChange("details")}>
        change-tab
      </button>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/ledger/actions", () => ({
  getLedgerAction: vi.fn(),
  getLedgersAction: vi.fn(),
  getEntryCategoriesAction: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: useQueryMock,
    useQueryClient: () => ({ invalidateQueries: vi.fn(), prefetchQuery: vi.fn() }),
  };
});

vi.mock("@/modules/task-queue/ui", () => ({
  useTaskQueue: useTaskQueueMock,
}));

vi.mock("../hooks", () => ({
  useLedgerTabs: useLedgerTabsMock,
  usePeriodFilter: usePeriodFilterMock,
  useDrilldownNavigation: useDrilldownNavigationMock,
}));

vi.mock("./Header", () => ({
  Header: ({
    onOpenInput,
    onOpenTaskQueue,
  }: {
    onOpenInput: () => void;
    onOpenTaskQueue: () => void;
  }) => (
    <div>
      <button data-testid="open-input" onClick={onOpenInput}>
        open-input
      </button>
      <button data-testid="open-task-queue" onClick={onOpenTaskQueue}>
        open-task-queue
      </button>
    </div>
  ),
}));

vi.mock("./useLedgerDialogState", () => ({
  useLedgerDialogState: useLedgerDialogStateMock,
}));

vi.mock("./useLedgerPagePrefetching", () => ({
  useLedgerPagePrefetching: useLedgerPagePrefetchingMock,
}));

vi.mock("../ledger-url-navigation", () => ({
  replaceLedgerUrl: replaceLedgerUrlMock,
}));

describe("LedgerPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useTaskQueueMock.mockReturnValue({
      stats: { total: 0, processing: 0, anomalyCount: 0, completedCount: 0, pendingCount: 0 },
    });
    useLedgerTabsMock.mockReturnValue({
      activeTab: "details",
      handleTabChange: vi.fn(),
    });
    usePeriodFilterMock.mockReturnValue({
      periodParams: { period: "thisMonth" },
      filterParams: {},
      handlePeriodChange: vi.fn(),
      handleFiltersChange: vi.fn(),
    });
    useDrilldownNavigationMock.mockReturnValue({
      handleCategoryDrilldown: vi.fn(),
      handleDateDrilldown: vi.fn(),
    });
    useLedgerDialogStateMock.mockReturnValue({
      isInputOpen: false,
      setIsInputOpen: vi.fn(),
      inputMode: "ai",
      setInputMode: vi.fn(),
      isPendingOpen: false,
      setIsPendingOpen: vi.fn(),
      handleInputDialogChange: vi.fn(),
    });

    useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[0] === "ledger") {
        return {
          data: {
            id: "ledger-1",
            userId: "user-1",
            metadata: { settings: { mainCurrency: "CNY", collapseEntriesDefault: false } },
          },
        };
      }
      if (queryKey[0] === "entryCategories") {
        return { data: [] };
      }
      if (queryKey[0] === "ledgers") {
        return { data: [] };
      }
      return { data: undefined };
    });
  });

  it("renders not-found state when ledger query returns null", () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[0] === "ledger") return { data: null };
      return { data: [] };
    });

    render(
      <LedgerPageClient
        ledgerId="ledger-1"
        initialTab="stream"
        initialPeriod={{ period: "thisMonth" }}
      />
    );

    expect(screen.getByText("notFound")).toBeTruthy();
  });

  it("wires prefetching and advanced filter url replacement in details flow", () => {
    render(
      <LedgerPageClient
        ledgerId="ledger-1"
        initialTab="details"
        initialPeriod={{ period: "thisMonth" }}
      />
    );

    expect(useLedgerPagePrefetchingMock).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("details-tab-trigger-filters"));
    expect(replaceLedgerUrlMock).toHaveBeenCalled();
  });

  it("opens task queue through header callback wiring", () => {
    const setIsPendingOpen = vi.fn();
    useLedgerDialogStateMock.mockReturnValue({
      isInputOpen: false,
      setIsInputOpen: vi.fn(),
      inputMode: "ai",
      setInputMode: vi.fn(),
      isPendingOpen: false,
      setIsPendingOpen,
      handleInputDialogChange: vi.fn(),
    });

    render(
      <LedgerPageClient
        ledgerId="ledger-1"
        initialTab="stream"
        initialPeriod={{ period: "thisMonth" }}
      />
    );

    fireEvent.click(screen.getByTestId("open-task-queue"));
    expect(setIsPendingOpen).toHaveBeenCalledWith(true);
  });
});
