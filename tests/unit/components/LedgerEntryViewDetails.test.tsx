import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LedgerEntryViewDetails, LedgerEntryEditFormData } from "@/components/ledger-entry/LedgerEntryViewDetails";
import { LedgerEntry, EntryCategory } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: (key: string) => (s: string) => s,
    useLocale: () => "en",
}));

// Mock child components
vi.mock("./SourceDocumentOriginalContent", () => ({
    SourceDocumentOriginalContent: () => <div data-testid="original-content">Original</div>,
}));

vi.mock("@/components/CategoryIcon", () => ({
    CategoryIcon: () => <div data-testid="category-icon">Icon</div>,
}));

describe("LedgerEntryViewDetails", () => {
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
        category: { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "" }
    };

    const mockCategories: EntryCategory[] = [
        { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "" }
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
        render(<LedgerEntryViewDetails {...defaultProps} />);
        expect(screen.getByText("Test Item")).toBeDefined();
        expect(screen.getByText("100.50")).toBeDefined();
        expect(screen.getByText("Test description")).toBeDefined();
    });

    it("renders input fields in edit mode with correct data", () => {
        render(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const itemNameInput = screen.getByPlaceholderText("itemName") as HTMLInputElement;
        expect(itemNameInput.value).toBe("Test Item");

        const dateInput = screen.getByDisplayValue("2023-01-28") as HTMLInputElement;
        expect(dateInput.type).toBe("date");
        expect(dateInput.value).toBe("2023-01-28");
    });

    it("triggers onEditChange when fields are updated", () => {
        render(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const itemNameInput = screen.getByPlaceholderText("itemName");
        fireEvent.change(itemNameInput, { target: { value: "New Item Name" } });

        expect(defaultProps.onEditChange).toHaveBeenCalledWith({
            ...mockEditData,
            itemName: "New Item Name"
        });
    });

    it("triggers onEditSave when save button is clicked", () => {
        render(<LedgerEntryViewDetails {...defaultProps} isEditing={true} />);

        const saveButton = screen.getByText("save");
        fireEvent.click(saveButton);

        expect(defaultProps.onEditSave).toHaveBeenCalled();
    });
});
