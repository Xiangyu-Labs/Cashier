import { render, screen, fireEvent } from "@testing-library/react";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { vi, describe, it, expect } from "vitest";
import { InputMessage, Transaction, Category } from "@/types/api";

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
    inputMessageId: "msg1",
    amount: "50",
    currency: "CNY",
    itemName: "Lunch",
    description: null,
    status: "pending",
    sourceType: "text",
    transactionDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    category: mockCategories[0],
};

const baseInputMessage: InputMessage = {
    id: "msg1",
    ledgerId: "l1",
    contentType: "text",
    content: "Lunch 50",
    aiResponse: null,
    createdAt: new Date("2024-01-01T12:00:00").toISOString(),
    status: "completed",
};

describe("BatchTransactionCard", () => {
    const defaultProps = {
        transactions: [mockTransaction],
        categories: mockCategories,
        onUpdateTransaction: vi.fn(),
        onDeleteTransaction: vi.fn(),
    };

    it("renders date header", () => {
        render(<BatchTransactionCard inputMessage={baseInputMessage} {...defaultProps} />);
        expect(screen.getByText(/1月1日/)).toBeTruthy();
    });

    it("renders text content", () => {
        render(<BatchTransactionCard inputMessage={baseInputMessage} {...defaultProps} />);
        expect(screen.getByText("Lunch 50")).toBeTruthy();
    });

    it("renders single image content", () => {
        const inputMessage: InputMessage = {
            ...baseInputMessage,
            contentType: "image",
            content: "data:image/png;base64,fake-image-data",
        };
        render(<BatchTransactionCard inputMessage={inputMessage} {...defaultProps} />);

        const imgs = screen.getAllByRole("img");
        // Expect at least one image with the src
        const userImg = imgs.find(img => img.getAttribute("src") === "data:image/png;base64,fake-image-data");
        expect(userImg).toBeTruthy();
    });

    it("renders multiple images content (JSON array)", () => {
        const imagesData = ["data:image/png;base64,img1", "data:image/png;base64,img2"];
        const inputMessage: InputMessage = {
            ...baseInputMessage,
            contentType: "image",
            content: JSON.stringify(imagesData),
        };
        render(<BatchTransactionCard inputMessage={inputMessage} {...defaultProps} />);

        const imgs = screen.getAllByRole("img");
        // Filter out any icons that might be rendered as imgs (though mocked CategoryIcon is a div)
        const userImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:image"));
        expect(userImgs).toHaveLength(2);
        expect(userImgs[0].getAttribute("src")).toBe(imagesData[0]);
        expect(userImgs[1].getAttribute("src")).toBe(imagesData[1]);
    });

    it("renders mixed content (JSON object)", () => {
        const mixedContent = {
            text: "Mixed notes",
            images: [{ data: "data:image/png;base64,img1", mimeType: "image/png" }]
        };
        const inputMessage: InputMessage = {
            ...baseInputMessage,
            contentType: "text", // The backend might save mixed as text or mixed, component handles parsing
            content: JSON.stringify(mixedContent),
        };
        render(<BatchTransactionCard inputMessage={inputMessage} {...defaultProps} />);

        expect(screen.getByText("Mixed notes")).toBeTruthy();

        const imgs = screen.getAllByRole("img");
        const userImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:image"));
        expect(userImgs).toHaveLength(1);
    });

    it("renders transaction details groups", () => {
        render(<BatchTransactionCard inputMessage={baseInputMessage} {...defaultProps} />);
        expect(screen.getByText("Food")).toBeTruthy();
        expect(screen.getByText(/50.00/)).toBeTruthy();
    });
});
