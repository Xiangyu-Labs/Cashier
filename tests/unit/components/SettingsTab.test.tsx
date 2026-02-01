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
        mainCurrency: "CNY",
        currencies: ["CNY", "USD"],
        aiLanguage: "zh-CN",
        autoRecognizeDate: true,
        collapseProcessingDefault: false,
        collapseBillsDefault: false,
        mergeSimilarItems: false,
        aiCustomPrompt: "Custom Prompt",
        userId: "u1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        await user.click(document.body); // Trigger blur

        await waitFor(() => {
            expect(mockUpdateLedgerAction).toHaveBeenCalledWith("l1", expect.objectContaining({
                aiCustomPrompt: "Custom PromptNew Custom Prompt"
            }));
        }, { timeout: 3000 });
    });
});
