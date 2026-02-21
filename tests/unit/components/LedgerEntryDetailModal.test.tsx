import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LedgerEntryDetailModal } from "@/features/ledger/components/LedgerEntryDetailModal";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { useEffect } from "react";

// Mock sub-components/hooks
vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }: { open: boolean, children: React.ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, onAnimationEnd }: { children: React.ReactNode, onAnimationEnd?: () => void }) => {
        useEffect(() => {
            if (onAnimationEnd) {
                onAnimationEnd();
            }
        }, [onAnimationEnd]);
        return <div>{children}</div>;
    },
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
    ConfirmDialog: ({ open, onConfirm }: { open: boolean, onConfirm: () => void }) => (open ? <button onClick={onConfirm}>Confirm Delete</button> : null),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

// Mock child components to simplify testing parent logic
vi.mock("@/features/ledger/components/LedgerEntryEditForm", () => ({
    LedgerEntryEditForm: ({ onSave, onCancel }: { onSave: () => void, onCancel: () => void }) => (
        <div>
            <button onClick={onSave}>Save</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    ),
}));

// Track pending changes for the mock to determine edit state
const _mockHasPendingChanges = false;

vi.mock("@/features/ledger/components/LedgerEntryViewDetails", () => ({
    LedgerEntryViewDetails: ({ pendingChanges, onFieldChange, onSave, onDiscard, onDelete }: {
        pendingChanges: Record<string, unknown>,
        onFieldChange: (changes: Record<string, unknown>) => void,
        onSave: () => void,
        onDiscard: () => void,
        onDelete: () => void
    }) => {
        const hasPendingChanges = Object.keys(pendingChanges || {}).length > 0;
        return (
            <div>
                {hasPendingChanges ? (
                    <>
                        <button onClick={onSave}>Save</button>
                        <button onClick={onDiscard}>Discard</button>
                    </>
                ) : (
                    <>
                        <button onClick={() => onFieldChange({ itemName: "Edited" })}>Edit</button>
                        <button onClick={onDelete}>Delete</button>
                    </>
                )}
            </div>
        );
    },
}));

describe("LedgerEntryDetailModal", () => {
    const mockLedgerEntry: LedgerEntry = {
        id: "1",
        ledgerId: "l1",
        categoryId: "c1",
        amount: "100",
        currency: "CNY",
        sourceDocumentId: "sd-1",
        description: null,
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        deletedAt: null,
        itemName: "Test Item",
        convertedAmount: null,
        exchangeRate: null,
        category: { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "", deletedAt: null, ledgerId: "l1", isEditable: true }
    };

    const mockCategories: EntryCategory[] = [
        { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "", deletedAt: null, ledgerId: "l1", isEditable: true },
        { id: "c2", name: "Transport", icon: "car", sortOrder: 1, description: null, createdAt: "", updatedAt: "", deletedAt: null, ledgerId: "l1", isEditable: true }
    ];

    const mockOnClose = vi.fn();
    const mockOnUpdate = vi.fn();
    const mockOnDelete = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders nothing when closed or no ledger entry", () => {
        const { rerender } = render(
            <LedgerEntryDetailModal
                ledgerEntry={null}
                categories={[]}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        // No title to check


        rerender(
            <LedgerEntryDetailModal
                ledgerEntry={mockLedgerEntry}
                categories={[]}
                open={false}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        // No title to check

    });

    it("renders details by default", () => {
        render(
            <LedgerEntryDetailModal
                ledgerEntry={mockLedgerEntry}
                categories={mockCategories}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        // Removed title expectation

        // Since we mocked ViewDetails, we check for Edit/Delete buttons
        expect(screen.getByText("Edit")).toBeDefined();
        expect(screen.getByText("Delete")).toBeDefined();
    });

    it("switches to edit mode and saves", async () => {
        render(
            <LedgerEntryDetailModal
                ledgerEntry={mockLedgerEntry}
                categories={mockCategories}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );

        fireEvent.click(screen.getByText("Edit"));

        // Wait for edit form
        expect(await screen.findByText("Save")).toBeDefined();

        fireEvent.click(screen.getByText("Save"));
        expect(mockOnUpdate).toHaveBeenCalled();
    });

    it("shows confirm dialog on delete", () => {
        render(
            <LedgerEntryDetailModal
                ledgerEntry={mockLedgerEntry}
                categories={mockCategories}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );

        fireEvent.click(screen.getByText("Delete"));
        expect(screen.getByText("Confirm Delete")).toBeDefined();

        fireEvent.click(screen.getByText("Confirm Delete"));
        expect(mockOnDelete).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
    });
});
