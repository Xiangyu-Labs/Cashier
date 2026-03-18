import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsTab } from "@/features/ledger/components/SettingsTab";
import { type Ledger, type EntryCategoryWithCount, type ServiceCredential } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create tracked mocks
const mockBack = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockSetTheme = vi.fn();
const mockUpdateLedgerAction = vi.fn((_id: string, _data: Partial<Ledger>) =>
  Promise.resolve({ success: true })
);
const mockSignOut = vi.fn();

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

vi.mock("@/features/ledger/server/actions/update", () => ({
  updateLedgerAction: (id: string, data: Partial<Ledger>) => mockUpdateLedgerAction(id, data),
}));

vi.mock("@/features/ledger/server/actions/categories", () => ({
  createEntryCategoryAction: vi.fn(),
  updateEntryCategoryAction: vi.fn(),
  deleteEntryCategoryAction: vi.fn(),
}));

vi.mock("@/features/ledger/server/actions/credentials", () => ({
  createServiceCredentialAction: vi.fn(),
  deleteServiceCredentialAction: vi.fn(),
}));

vi.mock("@/features/ledger/client/hooks/use-ledger-events", () => ({
  useLedgerEvents: () => ({}),
}));

vi.mock("@/features/notifications/components/PushNotificationManager", () => ({
  PushNotificationManager: () => <div>PushNotificationManager</div>,
}));

// Mock components
vi.mock("./settings/CurrencySection", () => ({
  CurrencySection: () => <div>CurrencySection</div>,
}));

vi.mock("./settings/CategorySection", () => ({
  CategorySection: () => <div>CategorySection</div>,
}));

vi.mock("./settings/ServiceCredentialSection", () => ({
  ServiceCredentialSection: () => <div>ServiceCredentialSection</div>,
}));

vi.mock("./settings/ProcessingSystemSection", () => ({
  ProcessingSystemSection: () => <div>ProcessingSystemSection</div>,
}));

vi.mock("./settings/LedgerManagementSection", () => ({
  LedgerManagementSection: () => <div>LedgerManagementSection</div>,
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

    const signOutButton = screen.getAllByText("signOut")[1]; // Get the button text, not the section header
    expect(signOutButton).toBeDefined();

    await user.click(signOutButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
