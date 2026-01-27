import { render, screen, fireEvent } from "@testing-library/react";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { vi, describe, it, expect } from "vitest";
import { Receipt, Transaction, Category } from "@/types/api";

// Mock dependencies
vi.mock("@/components/CategoryIcon", () => ({
    CategoryIcon: () => <div data-testid="category-icon" />,
}));

vi.mock("@/components/transaction/TransactionCard", () => ({
    TransactionCard: ({ transaction }: { transaction: Transaction }) => (
        <div data-testid="transaction-card">{transaction.itemName}</div>
    ),
}));

const mockCategories: Category[] = [
    {
        id: "cat1",
        name: "Food",
        description: null,
        icon: "food",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const mockTransaction: Transaction = {
    id: "tx1",
    ledgerId: "l1",
    categoryId: "cat1",
    receiptId: "msg1",
    amount: "50",
    currency: "CNY",
    itemName: "Lunch",
    description: null,
    transactionDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    category: mockCategories[0],
};

const baseReceipt: Receipt = {
    id: "msg1",
    ledgerId: "l1",
    text: "Lunch 50",
    imageUrls: [],
    aiResponse: null,
    createdAt: new Date("2024-01-01T12:00:00").toISOString(),
    status: "completed",
};

describe("BatchTransactionCard", () => {
    const mockUpdateTransaction = vi.fn();
    const mockDeleteTransaction = vi.fn();

    const defaultProps = {
        transactions: [],
        categories: mockCategories,
        onUpdateTransaction: mockUpdateTransaction,
        onDeleteTransaction: mockDeleteTransaction,
        status: "queued" as const,
    };

    it("renders date header", () => {
        render(<BatchTransactionCard receipt={baseReceipt} {...defaultProps} />);
        expect(screen.getByText(/1月1日/)).toBeTruthy();
    });

    it("renders text content", () => {
        render(<BatchTransactionCard receipt={baseReceipt} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("查看原始内容");
        fireEvent.click(expandButton);

        expect(screen.getByText("Lunch 50")).toBeTruthy();
    });

    it("renders single image content", () => {
        const receipt: Receipt = {
            ...baseReceipt,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        render(<BatchTransactionCard receipt={receipt} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("查看原始内容");
        fireEvent.click(expandButton);

        const imgs = screen.getAllByRole("img");
        // Expect at least one image with the src
        const userImg = imgs.find(img => img.getAttribute("src") === "data:image/png;base64,fake-image-data");
        expect(userImg).toBeTruthy();
    });

    it("renders multiple images content", () => {
        const imagesData = ["data:image/png;base64,img1", "data:image/png;base64,img2"];
        const receipt: Receipt = {
            ...baseReceipt,
            text: null,
            imageUrls: imagesData,
        };
        render(<BatchTransactionCard receipt={receipt} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("查看原始内容");
        fireEvent.click(expandButton);

        const imgs = screen.getAllByRole("img");
        // Filter out any icons that might be rendered as imgs (though mocked CategoryIcon is a div)
        const userImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:image"));
        expect(userImgs).toHaveLength(2);
        expect(userImgs[0].getAttribute("src")).toBe(imagesData[0]);
        expect(userImgs[1].getAttribute("src")).toBe(imagesData[1]);
    });

    it("renders transaction details groups", () => {
        render(<BatchTransactionCard receipt={baseReceipt} {...defaultProps} transactions={[mockTransaction]} />);
        expect(screen.getByText("Food")).toBeTruthy();
        const amounts = screen.getAllByText(/50.00/);
        expect(amounts.length).toBeGreaterThan(0);
    });

    it("opens image zoom dialog on click", async () => {
        const receipt: Receipt = {
            ...baseReceipt,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        render(<BatchTransactionCard receipt={receipt} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("查看原始内容");
        fireEvent.click(expandButton);

        // Find the thumbnail image
        const imgs = screen.getAllByRole("img");
        const thumbnail = imgs.find(img => img.getAttribute("src") === "data:image/png;base64,fake-image-data");
        expect(thumbnail).toBeTruthy();

        // Click it
        fireEvent.click(thumbnail!);

        // Expect dialog to be open and show the image
        const zoomedImg = await screen.findByAltText("Image 1");
        expect(zoomedImg).toBeTruthy();
        expect(zoomedImg.getAttribute("src")).toBe("data:image/png;base64,fake-image-data");

        // Close via Escape
        fireEvent.keyDown(zoomedImg, { key: "Escape", code: "Escape" });
    });

    it("renders status when no transactions", () => {
        render(<BatchTransactionCard receipt={baseReceipt} {...defaultProps} transactions={[]} status="queued" />);
        expect(screen.getByText("排队中")).toBeTruthy();
    });

    it("renders total amount and hides status when transactions exist", () => {
        render(<BatchTransactionCard receipt={baseReceipt} {...defaultProps} transactions={[mockTransaction]} status="processing" />);
        // Should show total amount (50.00 CNY)
        const currencies = screen.getAllByText("CNY");
        expect(currencies.length).toBeGreaterThan(0);
        const amounts = screen.getAllByText(/50.00/);
        expect(amounts.length).toBeGreaterThan(0);

        // Should NOT show status "Processing..."
        const processingText = screen.queryByText("处理中...");
        expect(processingText).toBeNull();
    });
});
