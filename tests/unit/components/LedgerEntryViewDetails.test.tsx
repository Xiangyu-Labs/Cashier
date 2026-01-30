import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LedgerEntryViewDetails, LedgerEntryEditFormData } from "@/components/ledger-entry/LedgerEntryViewDetails";
import { LedgerEntry, EntryCategory } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: (_key: string) => (s: string) => s,
    useLocale: () => "en",
}));

// Mock currencies config
vi.mock("@/config/currencies", () => ({
    SUPPORTED_CURRENCIES: ["USD", "EUR", "CNY", "HKD", "JPY"]
}));

// Mock child components
vi.mock("./SourceDocumentOriginalContent", () => ({
    SourceDocumentOriginalContent: () => <div data-testid="original-content">Original</div>,
}));

vi.mock("@/components/CategoryIcon", () => ({
    CategoryIcon: () => <div data-testid="category-icon">Icon</div>,
}));

describe("LedgerEntryViewDetails", () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    const renderWithQuery = (ui: React.ReactElement) => {
        return render(ui, {
            wrapper: ({ children }) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            ),
        });
    };

    const mockLedgerEntry: LedgerEntry = {
        id: "1",
        ledgerId: "l1",
        categoryId: "c1",
        amount: "100.50",
        currency: "CNY",
        sourceDocumentId: null,
        description: "Test description",
        entryDate: "2023-01-28T10:00:00Z",
        createdAt: "2023-01-28T10:00:00Z",
        itemName: "Test Item",
        category: { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, isEditable: true, createdAt: "", updatedAt: "" }
    };

    const mockCategories: EntryCategory[] = [
        { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, isEditable: true, createdAt: "", updatedAt: "" }
    ];

    const mockEditData: LedgerEntryEditFormData = {
        itemName: "Test Item",
        amount: 100.5,
        currency: "CNY",
        categoryId: "c1",
        entryDate: "2023-01-28", // Already ISO date string from initialization logic in Modal
        description: "Test description",
    };

    const defaultProps = {
        ledgerEntry: mockLedgerEntry,
        isEditing: false,
        editData: mockEditData,
        categories: mockCategories,
        onEditStart: vi.fn(),
        onEditChange: vi.fn(),
        onEditSave: vi.fn(),
        onEditCancel: vi.fn(),
        onDelete: vi.fn(),
    };

    it("renders item details in view mode", () => {
        renderWithQuery(<LedgerEntryViewDetails {...defaultProps} />);
        expect(screen.getByText("Test Item")).toBeDefined();
        expect(screen.getByText("100.50")).toBeDefined();
        expect(screen.getByText("Test description")).toBeDefined();
    });

    it("renders input fields in edit mode with correct data", () => {
        renderWithQuery(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const itemNameInput = screen.getByPlaceholderText("itemName") as HTMLInputElement;
        expect(itemNameInput.value).toBe("Test Item");

        const dateInput = screen.getByDisplayValue("2023-01-28") as HTMLInputElement;
        expect(dateInput.type).toBe("date");
        expect(dateInput.value).toBe("2023-01-28");
    });

    it("triggers onEditChange when fields are updated", () => {
        renderWithQuery(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const itemNameInput = screen.getByPlaceholderText("itemName");
        fireEvent.change(itemNameInput, { target: { value: "New Item Name" } });

        expect(defaultProps.onEditChange).toHaveBeenCalledWith({
            ...mockEditData,
            itemName: "New Item Name"
        });
    });

    it("triggers onEditSave when save button is clicked", () => {
        renderWithQuery(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const saveButton = screen.getByText("save");
        fireEvent.click(saveButton);

        expect(defaultProps.onEditSave).toHaveBeenCalled();
    });

    it("shows preferred currencies first in the selector", () => {
        const preferredCurrencies = ["HKD", "JPY"];
        const { container } = renderWithQuery(
            <LedgerEntryViewDetails
                {...defaultProps}
                isEditing={true}
                preferredCurrencies={preferredCurrencies}
            />
        );

        const select = container.querySelector("select") as HTMLSelectElement;
        const options = Array.from(select.options).map(opt => opt.value);

        // HKD, JPY should be first (after unknown since mockLedgerEntry status is not confirmed)
        // Default mockLedgerEntry doesn't have status, let's assume it's pending if status is undefined in component logic?
        // Wait, LedgerEntry status is optional. Let's check component logic.
        // const showUnknown = ledgerEntry.status === "pending"; (from my implementation)
        // If status is undefined, showUnknown is false.

        expect(options[0]).toBe("HKD");
        expect(options[1]).toBe("JPY");
    });

    it("shows 'unknown' option only for anomaly entries", () => {
        // Pending status (has anomaly)
        const anomalyDoc = { status: "anomaly" } as any;
        const pendingEntry = { ...mockLedgerEntry, sourceDocument: anomalyDoc };

        const { rerender, container } = renderWithQuery(
            <LedgerEntryViewDetails
                {...defaultProps}
                ledgerEntry={pendingEntry}
                isEditing={true}
            />
        );

        let select = container.querySelector("select") as HTMLSelectElement;
        expect(Array.from(select.options).some(opt => opt.value === "unknown")).toBe(true);

        // Confirmed status (no anomaly)
        const confirmedDoc = { status: "completed" } as any;
        const confirmedEntry = { ...mockLedgerEntry, sourceDocument: confirmedDoc };
        rerender(
            <LedgerEntryViewDetails
                {...defaultProps}
                ledgerEntry={confirmedEntry}
                isEditing={true}
            />
        );

        select = container.querySelector("select") as HTMLSelectElement;
        expect(Array.from(select.options).some(opt => opt.value === "unknown")).toBe(false);
    });
});
