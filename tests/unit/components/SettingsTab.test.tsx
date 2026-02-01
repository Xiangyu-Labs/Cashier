import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsTab } from "@/features/ledger/components/SettingsTab";
import { Ledger, EntryCategory, ServiceCredential } from "@/types/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create tracked mocks
const mockBack = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockSetTheme = vi.fn();
const mockUpdateLedgerAction = vi.fn((id: string, data: any) => Promise.resolve({ success: true }));
const mockSignOutAction = vi.fn();

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

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/features/ledger/server/actions/ledgers", () => ({
    updateLedgerAction: (id: string, data: any) => mockUpdateLedgerAction(id, data),
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

vi.mock("@/features/auth/server/actions/sign-out", () => ({
    signOutAction: () => mockSignOutAction(),
}));

vi.mock("@/features/ledger/client/hooks/use-ledger-events", () => ({
    useLedgerEvents: () => ({}),
}));

vi.mock("@/features/notifications/components/PushNotificationManager", () => ({
    PushNotificationManager: () => <div>PushNotificationManager</div>,
}));

// Mock components
vi.mock("@/app/[locale]/ledger/[id]/settings/components/CurrencySection", () => ({
    CurrencySection: () => <div>CurrencySection</div>,
}));

vi.mock("@/app/[locale]/ledger/[id]/settings/components/CategorySection", () => ({
    CategorySection: () => <div>CategorySection</div>,
}));

vi.mock("@/app/[locale]/ledger/[id]/settings/components/ServiceCredentialSection", () => ({
    ServiceCredentialSection: () => <div>ServiceCredentialSection</div>,
}));

vi.mock("@/app/[locale]/ledger/[id]/settings/components/ProcessingSystemSection", () => ({
    ProcessingSystemSection: () => <div>ProcessingSystemSection</div>,
}));

describe("SettingsTab", () => {
    const mockLedger: Ledger = {
        id: "l1",
        name: "Test Ledger",
        userId: "u1",
        metadata: {
            settings: {
                mainCurrency: "CNY",
                currencies: ["CNY", "USD"],
                aiLanguage: "zh-CN",
                autoRecognizeDate: true,
                collapseProcessingDefault: false,
                collapseBillsDefault: false,
                mergeSimilarItems: false,
                aiCustomPrompt: "Custom Prompt",
            }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
    };

    const mockCategories: EntryCategory[] = [];
    const mockCredentials: ServiceCredential[] = [];

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
                <SettingsTab
                    ledger={mockLedger}
                    initialCategories={mockCategories}
                    initialCredentials={mockCredentials}
                    ledgerId="l1"
                />
            </QueryClientProvider>
        );

        expect(screen.getByText("appearance")).toBeDefined();
        expect(screen.getByText("assistant")).toBeDefined();
        expect(screen.getByText("dataConfig")).toBeDefined();
    });

    it("handles theme switching", () => {
        render(
            <QueryClientProvider client={queryClient}>
                <SettingsTab
                    ledger={mockLedger}
                    initialCategories={mockCategories}
                    initialCredentials={mockCredentials}
                    ledgerId="l1"
                />
            </QueryClientProvider>
        );

        const darkButton = screen.getByTitle("themeDark");
        fireEvent.click(darkButton);
        expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("handles AI prompt updates on blur", async () => {
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={queryClient}>
                <SettingsTab
                    ledger={mockLedger}
                    initialCategories={mockCategories}
                    initialCredentials={mockCredentials}
                    ledgerId="l1"
                />
            </QueryClientProvider>
        );

        const textarea = screen.getByPlaceholderText("aiPromptPlaceholder");
        await user.type(textarea, "New Custom Prompt");
        await user.tab();
        await waitFor(() => {
            expect(mockUpdateLedgerAction).toHaveBeenCalledWith("l1", expect.objectContaining({
                settings: expect.objectContaining({
                    aiCustomPrompt: "Custom PromptNew Custom Prompt"
                })
            }));
        }, { timeout: 3000 });
    });

    it("renders ledger name input and handles update", async () => {
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={queryClient}>
                <SettingsTab
                    ledger={mockLedger}
                    initialCategories={mockCategories}
                    initialCredentials={mockCredentials}
                    ledgerId="l1"
                />
            </QueryClientProvider>
        );

        const input = screen.getByDisplayValue("Test Ledger");
        expect(input).toBeDefined();

        await user.clear(input);
        await user.type(input, "Updated Ledger Name");
        await user.tab();

        await waitFor(() => {
            expect(mockUpdateLedgerAction).toHaveBeenCalledWith("l1", expect.objectContaining({
                name: "Updated Ledger Name"
            }));
        });
    });

    it("renders sign out button and handles click", async () => {
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={queryClient}>
                <SettingsTab
                    ledger={mockLedger}
                    initialCategories={mockCategories}
                    initialCredentials={mockCredentials}
                    ledgerId="l1"
                />
            </QueryClientProvider>
        );

        const signOutButton = screen.getAllByText("signOut")[1]; // Get the button text, not the section header
        expect(signOutButton).toBeDefined();

        await user.click(signOutButton);

        await waitFor(() => {
            expect(mockSignOutAction).toHaveBeenCalled();
        });
    });
});
