import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitForElementToBeRemoved, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceDocumentDetailModal } from "@/components/ledger-entry/SourceDocumentDetailModal";
import { NextIntlClientProvider } from "next-intl";
import zh from "../../../messages/zh.json";

const mockSourceDocument = {
    id: "sd-1",
    ledgerId: "l-1",
    title: "Test Bill",
    text: "Sample OCR text",
    imageUrls: [],
    status: "completed" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const mockLedgerEntries = [
    {
        id: "le-1",
        ledgerId: "l-1",
        sourceDocumentId: "sd-1",
        itemName: "Item 1",
        amount: "100.00",
        currency: "CNY",
        categoryId: "cat-1",
        category: {
            id: "cat-1",
            name: "Food",
            icon: "Utensils",
            sortOrder: 1,
            description: "",
            isEditable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        description: "",
        entryDate: new Date().toISOString(),
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: "le-2",
        ledgerId: "l-1",
        sourceDocumentId: "sd-1",
        itemName: "Item 2",
        amount: "50.00",
        currency: "USD",
        categoryId: "cat-2",
        category: {
            id: "cat-2",
            name: "Transport",
            icon: "Car",
            sortOrder: 2,
            description: "",
            isEditable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        description: "",
        entryDate: new Date().toISOString(),
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const mockCategories = [
    {
        id: "cat-1",
        name: "Food",
        icon: "Utensils",
        sortOrder: 1,
        description: "",
        isEditable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: "cat-2",
        name: "Transport",
        icon: "Car",
        sortOrder: 2,
        description: "",
        isEditable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
];

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("SourceDocumentDetailModal", () => {
    const defaultProps = {
        sourceDocument: mockSourceDocument,
        ledgerEntries: mockLedgerEntries,
        categories: mockCategories,
        open: true,
        onClose: vi.fn(),
        onUpdateTitle: vi.fn(),
        onBatchUpdate: vi.fn(),
        onDeleteEntry: vi.fn(),
        onBatchDelete: vi.fn(),
    };

    const renderModal = (props = defaultProps) => {
        return render(
            <NextIntlClientProvider locale="zh" messages={zh}>
                <SourceDocumentDetailModal {...props} />
            </NextIntlClientProvider>
        );
    };

    it("renders modal title and entries", () => {
        renderModal();
        expect(screen.getByText("Test Bill")).toBeDefined();
        expect(screen.getByText("Item 1")).toBeDefined();
        expect(screen.getByText("Item 2")).toBeDefined();
        expect(screen.getByText("100.00")).toBeDefined();
        expect(screen.getByText("50.00")).toBeDefined();
    });

    it("allows editing the title", async () => {
        renderModal();
        const titleText = screen.getByText("Test Bill");
        fireEvent.click(titleText);

        const input = screen.getByPlaceholderText("输入账单标题");
        fireEvent.change(input, { target: { value: "Updated Bill" } });

        const saveBtn = screen.getAllByRole("button").find(b => b.querySelector("svg.lucide-check"));
        if (saveBtn) fireEvent.click(saveBtn);

        expect(defaultProps.onUpdateTitle).toHaveBeenCalledWith("Updated Bill");
        await waitFor(() => expect(screen.queryByPlaceholderText("输入账单标题")).toBeNull());
    });

    it("handles batch selection", async () => {
        renderModal();

        // Select all
        const selectAllBtn = screen.getByText("全选");
        fireEvent.click(selectAllBtn);

        // Verify batch toolbar appears (selected count in Chinese)
        const toolbarText = screen.getByText(/已选/);
        expect(toolbarText).toBeDefined();

        // Deselect all
        const deselectAllBtn = screen.getByText("取消全选");
        fireEvent.click(deselectAllBtn);

        // Wait for it to be removed (AnimatePresence exit animation)
        // Wait for it to be removed (AnimatePresence exit animation - mocked)
        await waitFor(() => expect(screen.queryByText(/已选/)).toBeNull());
    });

    it("triggers batch category update", async () => {
        const user = userEvent.setup();
        renderModal();
        const selectAllBtn = screen.getByText("全选");
        await user.click(selectAllBtn);
        const batchCatBtn = await screen.findByText(/批量修改类别/);
        await user.click(batchCatBtn);

        // Find the Food option in the popover (the button one)
        const foodOptions = screen.getAllByText("Food");
        const foodBtn = foodOptions.find(el => el.closest("button"));
        if (foodBtn) fireEvent.click(foodBtn);

        expect(defaultProps.onBatchUpdate).toHaveBeenCalledWith(
            ["le-1", "le-2"],
            { categoryId: "cat-1" }
        );
        await waitFor(() => expect(screen.queryByText(/批量修改类别/)).toBeNull());
    });

    it("triggers batch currency update", async () => {
        const user = userEvent.setup();
        renderModal();
        const selectAllBtn = screen.getByText("全选");
        await user.click(selectAllBtn);

        const batchCurrBtn = await screen.findByText(/批量修改货币/);
        await user.click(batchCurrBtn);

        const eurOptions = screen.getAllByText("EUR");
        const eurBtn = eurOptions.find(el => el.closest("button"));
        if (eurBtn) fireEvent.click(eurBtn);

        expect(defaultProps.onBatchUpdate).toHaveBeenCalledWith(
            ["le-1", "le-2"],
            { currency: "EUR" }
        );
        await waitFor(() => expect(screen.queryByText(/批量修改货币/)).toBeNull());
    });

    it("triggers entry deletion", () => {
        renderModal();
        const _deleteButtons = screen.getAllByRole("button").filter(b => b.className.includes("text-muted-foreground"));
        // This is a bit fragile due to styling, but let's try to find the trash icon buttons
        const firstTrashBtn = screen.getAllByRole("button").find(b => b.querySelector("svg.lucide-trash2"));
        if (firstTrashBtn) {
            fireEvent.click(firstTrashBtn);
            expect(defaultProps.onDeleteEntry).toHaveBeenCalledWith("le-1");
        }
    });

    it("triggers batch delete", async () => {
        const confirmMock = vi.fn(() => true);
        vi.stubGlobal("confirm", confirmMock);
        const user = userEvent.setup();
        renderModal();

        // Select all
        const selectAllBtn = screen.getByText("全选");
        await user.click(selectAllBtn);

        // Click batch delete
        const batchDeleteBtn = await screen.findByText(/删除/);
        await user.click(batchDeleteBtn);

        expect(defaultProps.onBatchDelete).toHaveBeenCalledWith(["le-1", "le-2"]);
        await waitFor(() => expect(screen.queryByText(/删除/)).toBeNull());
    });
});
