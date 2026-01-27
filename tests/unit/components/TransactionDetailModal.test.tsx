import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { Transaction, Category } from "@/types/api";
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
vi.mock("@/components/transaction/TransactionEditForm", () => ({
    TransactionEditForm: ({ onSave, onCancel }: { onSave: () => void, onCancel: () => void }) => (
        <div>
            <button onClick={onSave}>Save</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    ),
}));

vi.mock("@/components/transaction/TransactionViewDetails", () => ({
    TransactionViewDetails: ({ onEdit, onDelete }: { onEdit: () => void, onDelete: () => void }) => (
        <div>
            <button onClick={onEdit}>Edit</button>
            <button onClick={onDelete}>Delete</button>
        </div>
    ),
}));

describe("TransactionDetailModal", () => {
    const mockTransaction: Transaction = {
        id: "1",
        ledgerId: "l1",
        categoryId: "c1",
        amount: "100",
        currency: "CNY",
        status: "confirmed",
        sourceType: "text",
        inputMessageId: null,
        description: null,
        transactionDate: "2023-01-01",
        createdAt: "2023-01-01",
        itemName: "Test Item",
        category: { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "" }
    };

    const mockCategories: Category[] = [
        { id: "c1", name: "Food", icon: "food", sortOrder: 0, description: null, createdAt: "", updatedAt: "" }
    ];

    const mockOnClose = vi.fn();
    const mockOnUpdate = vi.fn();
    const mockOnDelete = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders nothing when closed or no transaction", () => {
        const { rerender } = render(
            <TransactionDetailModal
                transaction={null}
                categories={[]}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        expect(screen.queryByText("交易详情")).toBeNull();

        rerender(
            <TransactionDetailModal
                transaction={mockTransaction}
                categories={[]}
                open={false}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        expect(screen.queryByText("交易详情")).toBeNull();
    });

    it("renders details by default", () => {
        render(
            <TransactionDetailModal
                transaction={mockTransaction}
                categories={mockCategories}
                open={true}
                onClose={mockOnClose}
                onUpdate={mockOnUpdate}
                onDelete={mockOnDelete}
            />
        );
        expect(screen.getByText("交易详情")).toBeDefined();
        // Since we mocked ViewDetails, we check for Edit/Delete buttons
        expect(screen.getByText("Edit")).toBeDefined();
        expect(screen.getByText("Delete")).toBeDefined();
    });

    it("switches to edit mode and saves", async () => {
        render(
            <TransactionDetailModal
                transaction={mockTransaction}
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
            <TransactionDetailModal
                transaction={mockTransaction}
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
