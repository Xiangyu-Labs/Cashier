import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsTab } from "@/features/ledger/components/SettingsTab";
import { Ledger, EntryCategory, ServiceCredential } from "@/types/api";

// Create tracked mocks
const mockBack = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockSetTheme = vi.fn();
const mockUpdateLedgerAction = vi.fn(() => Promise.resolve({ success: true }));

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

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders settings sections correctly", () => {
        render(
            <SettingsTab
                ledger={mockLedger}
                initialCategories={mockCategories}
                initialCredentials={mockCredentials}
                ledgerId="l1"
            />
        );

        expect(screen.getByText("appearance")).toBeDefined();
        expect(screen.getByText("assistant")).toBeDefined();
        expect(screen.getByText("dataConfig")).toBeDefined();
    });

    it("handles theme switching", () => {
        render(
            <SettingsTab
                ledger={mockLedger}
                initialCategories={mockCategories}
                initialCredentials={mockCredentials}
                ledgerId="l1"
            />
        );

        const darkButton = screen.getByTitle("themeDark");
        fireEvent.click(darkButton);
        expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("handles AI prompt updates on blur", async () => {
        render(
            <SettingsTab
                ledger={mockLedger}
                initialCategories={mockCategories}
                initialCredentials={mockCredentials}
                ledgerId="l1"
            />
        );

        const textarea = screen.getByPlaceholderText("aiPromptPlaceholder");
        fireEvent.change(textarea, { target: { value: "New Custom Prompt" } });
        fireEvent.blur(textarea);

        await waitFor(() => {
            expect(mockUpdateLedgerAction).toHaveBeenCalledWith("l1", expect.objectContaining({
                aiCustomPrompt: "New Custom Prompt"
            }));
        });
    });
});
