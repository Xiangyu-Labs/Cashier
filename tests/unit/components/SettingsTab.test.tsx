import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsTab } from "@/modules/ledger/ui";
import type {
  EntryCategoryWithCountDto as EntryCategoryWithCount,
  LedgerDto as Ledger,
  ServiceCredentialDto as ServiceCredential,
} from "@/modules/ledger/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { asQueryLike } from "tests/helpers/react-query";

// Create tracked mocks
const mockBack = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockSetTheme = vi.fn();
const mockUpdateLedgerAction = vi.fn((_id: string, _data: Partial<Ledger>) =>
  Promise.resolve({ success: true })
);
const mockSubmitAutoCategorizeAction = vi.fn().mockResolvedValue({
  submittedCount: 2,
  skippedCount: 1,
});
const mockSignOut = vi.fn();
const pullToRefreshProps: Array<{ onRefresh: () => Promise<void> }> = [];
const categorySectionProps: Array<{
  onAutoCategorize?: () => Promise<{ submittedCount: number; skippedCount: number }>;
}> = [];

// Mock Redis to prevent connection attempts
vi.mock("ioredis", () => {
  const Redis = vi.fn();
  Redis.prototype.publish = vi.fn();
  Redis.prototype.subscribe = vi.fn();
  Redis.prototype.on = vi.fn();
  Redis.prototype.disconnect = vi.fn();
  return { default: Redis, Redis };
});

// Mock connection.ts to prevent using the real IORedis class if it was already loaded
vi.mock("@/lib/flow/connection", () => ({
  getRedisConnection: vi.fn(() => ({
    on: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    flushall: vi.fn(),
    duplicate: vi.fn(() => ({
      on: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  })),
}));

// Mock hooks and actions
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ back: mockBack, refresh: mockRefresh, push: mockPush }),
  usePathname: () => "/ledger/1/settings",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
}));
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/modules/ledger/actions", () => ({
  updateLedgerAction: (id: string, data: Partial<Ledger>) => mockUpdateLedgerAction(id, data),
  submitAutoCategorizeAction: (ledgerId: string) => mockSubmitAutoCategorizeAction(ledgerId),
  createEntryCategoryAction: vi.fn(),
  updateEntryCategoryAction: vi.fn(),
  deleteEntryCategoryAction: vi.fn(),
  createServiceCredentialAction: vi.fn(),
  deleteServiceCredentialAction: vi.fn(),
}));

// Mock components
vi.mock("@/modules/ledger/ui/CurrencySection", () => ({
  CurrencySection: () => <div>CurrencySection</div>,
}));

vi.mock("@/modules/ledger/ui/CategorySection", () => ({
  CategorySection: (props: {
    onAutoCategorize?: () => Promise<{ submittedCount: number; skippedCount: number }>;
  }) => {
    categorySectionProps.push(props);
    return <div>CategorySection</div>;
  },
}));

vi.mock("@/modules/ledger/ui/ServiceCredentialSection", () => ({
  ServiceCredentialSection: () => <div>ServiceCredentialSection</div>,
}));

vi.mock("@/modules/ledger/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <button type="button">{title}</button>
      <div>{children}</div>
    </div>
  ),
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

describe("SettingsTab", () => {
  const mockLedger: Ledger = {
    id: "l1",
    userId: "u1",
    metadata: {
      settings: {
        mainCurrency: "CNY",
        currencies: ["CNY", "USD"],
        aiLanguage: "zh-CN",
        collapseEntriesDefault: false,

        aiCustomPrompt: "Custom Prompt",
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const mockCategories: EntryCategoryWithCount[] = [];
  const _mockCredentials: ServiceCredential[] = [];

  let queryClient: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    pullToRefreshProps.length = 0;
    categorySectionProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  it("renders settings sections correctly", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    expect(screen.getByText("general")).toBeDefined();
    expect(screen.getByText("ledger")).toBeDefined();
  });

  it("handles theme switching", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    // Expand the General section first
    const generalButton = screen.getByText("general");
    await user.click(generalButton);

    const darkButton = screen.getByTitle("themeDark");
    fireEvent.click(darkButton);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("handles AI prompt updates on blur", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    // Expand the AI Assistant section first
    const aiAssistantButton = screen.getByText("aiAssistant");
    await user.click(aiAssistantButton);

    const textarea = screen.getByPlaceholderText("aiPromptPlaceholder");
    await user.type(textarea, "New Custom Prompt");
    await user.tab();
    await waitFor(
      () => {
        expect(mockUpdateLedgerAction).toHaveBeenCalledWith(
          "l1",
          expect.objectContaining({
            settings: expect.objectContaining({
              aiCustomPrompt: "Custom PromptNew Custom Prompt",
            }),
          })
        );
      },
      { timeout: 3000 }
    );
  });

  it("saves empty AI prompt when user clears the field on blur", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    // Expand the AI Assistant section first
    const aiAssistantButton = screen.getByText("aiAssistant");
    await user.click(aiAssistantButton);

    const textarea = screen.getByPlaceholderText("aiPromptPlaceholder");
    // Clear the existing value and blur
    await user.clear(textarea);
    await user.tab();
    await waitFor(
      () => {
        expect(mockUpdateLedgerAction).toHaveBeenCalledWith(
          "l1",
          expect.objectContaining({
            settings: expect.objectContaining({
              aiCustomPrompt: "",
            }),
          })
        );
      },
      { timeout: 3000 }
    );
  });

  it("renders sign out button and handles click", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    // Expand the Account section first
    const accountButton = screen.getByText("account");
    await user.click(accountButton);

    const signOutButtons = screen.getAllByText("signOut");
    const signOutButton = signOutButtons[1]; // Get the button text, not the section header
    expect(signOutButton).toBeDefined();
    if (signOutButton == null) {
      throw new Error("Expected sign-out button");
    }

    await user.click(signOutButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it("pull-to-refresh invalidates both settings and ledger queries", async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={mockCategories} ledgerId="l1" />
      </QueryClientProvider>
    );

    const refreshHandler = pullToRefreshProps[0]?.onRefresh;
    expect(refreshHandler).toBeTypeOf("function");
    if (refreshHandler == null) {
      throw new Error("Expected PullToRefresh to receive onRefresh");
    }

    await refreshHandler();

    const predicates = invalidateQueriesSpy.mock.calls
      .flatMap((call) => (call[0]?.predicate == null ? [] : [call[0].predicate]));
    expect(predicates.length).toBeGreaterThan(0);

    const settingsMatched = predicates.some((predicate) =>
      predicate(asQueryLike(queryKeys.ledgerSettings("l1")))
    );
    const ledgerMatched = predicates.some((predicate) =>
      predicate(asQueryLike(queryKeys.ledger("l1")))
    );

    expect(settingsMatched).toBe(true);
    expect(ledgerMatched).toBe(true);
  });

  it("delegates auto-categorize through the dedicated mutation hook", async () => {
    const categoriesWithItem: EntryCategoryWithCount[] = [
      {
        id: "cat-1",
        ledgerId: "l1",
        name: "Food",
        description: null,
        icon: null,
        sortOrder: 1,
        isEditable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        entryCount: 1,
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsTab ledger={mockLedger} initialCategories={categoriesWithItem} ledgerId="l1" />
      </QueryClientProvider>
    );

    const autoCategorize = categorySectionProps[0]?.onAutoCategorize;
    expect(autoCategorize).toBeTypeOf("function");
    if (autoCategorize == null) {
      throw new Error("Expected CategorySection to receive onAutoCategorize");
    }

    await autoCategorize();

    await waitFor(() => {
      expect(mockSubmitAutoCategorizeAction).toHaveBeenCalledWith("l1");
    });
  });
});
