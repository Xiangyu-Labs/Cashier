import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceDocumentCard } from "@/components/ledger-entry/SourceDocumentCard";
import { vi, describe, it, expect } from "vitest";
import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";

// Mock dependencies
vi.mock("@/components/CategoryIcon", () => ({
    CategoryIcon: () => <div data-testid="category-icon" />,
}));

vi.mock("@/components/ledger-entry/LedgerEntryCard", () => ({
    LedgerEntryCard: ({ ledgerEntry, showStatusHint }: { ledgerEntry: LedgerEntry, showStatusHint?: boolean }) => {
        const hasIssue = !ledgerEntry.categoryId || !ledgerEntry.currency || ledgerEntry.currency === "unknown";
        return (
            <div data-testid="ledger-entry-card">
                {ledgerEntry.itemName}
                {showStatusHint && hasIssue && <span>(待修正)</span>}
            </div>
        );
    },
}));

const mockCategories: EntryCategory[] = [
    {
        id: "cat1",
        name: "Food",
        description: null,
        icon: "food",
        sortOrder: 1,
        isEditable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const mockLedgerEntry: LedgerEntry = {
    id: "tx1",
    ledgerId: "l1",
    categoryId: "cat1",
    sourceDocumentId: "msg1",
    amount: "50",
    currency: "CNY",
    itemName: "Lunch",
    description: null,
    entryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    category: mockCategories[0],
};

const baseSourceDocument: SourceDocument = {
    id: "msg1",
    ledgerId: "l1",
    title: null,
    text: "Lunch 50",
    imageUrls: [],
    createdAt: new Date("2024-01-01T12:00:00").toISOString(),
    status: "completed",
};

describe("SourceDocumentCard", () => {
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

    const mockUpdateLedgerEntry = vi.fn();
    const mockDeleteLedgerEntry = vi.fn();

    const defaultProps = {
        ledgerEntries: [],
        categories: mockCategories,
        onUpdateLedgerEntry: mockUpdateLedgerEntry,
        onDeleteLedgerEntry: mockDeleteLedgerEntry,
        status: "queued" as const,
    };

    it("renders date header", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} />);
        expect(screen.getByText(/1月1日/)).toBeTruthy();
    });

    it("renders text content", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("viewContent");
        fireEvent.click(expandButton);

        expect(screen.getByText("Lunch 50")).toBeTruthy();
    });

    it("renders single image content", () => {
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("viewContent");
        fireEvent.click(expandButton);

        const imgs = screen.getAllByRole("img");
        // Expect at least one image with the src
        const userImg = imgs.find(img => img.getAttribute("src") === "data:image/png;base64,fake-image-data");
        expect(userImg).toBeTruthy();
    });

    it("renders multiple images content", () => {
        const imagesData = ["data:image/png;base64,img1", "data:image/png;base64,img2"];
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: imagesData,
        };
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("viewContent");
        fireEvent.click(expandButton);

        const imgs = screen.getAllByRole("img");
        // Filter out any icons that might be rendered as imgs (though mocked CategoryIcon is a div)
        const userImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:image"));
        expect(userImgs).toHaveLength(2);
        expect(userImgs[0].getAttribute("src")).toBe(imagesData[0]);
        expect(userImgs[1].getAttribute("src")).toBe(imagesData[1]);
    });

    it("renders ledger entry details directly", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} />);
        // It should directly render the ledger entry card
        expect(screen.getByTestId("ledger-entry-card")).toBeTruthy();
        expect(screen.getByText("Lunch")).toBeTruthy();
    });

    it("opens image zoom dialog on click", async () => {
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} />);

        // Expand content
        const expandButton = screen.getByTitle("viewContent");
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

    it("renders status when no ledger entries", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[]} status="queued" />);
        expect(screen.getByText("处理中")).toBeTruthy();
    });

    it("renders error status and message when errorCode is provided", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[]} status="error" errorCode="parse_failed" />);
        expect(screen.getByText("parse_failed")).toBeTruthy();
    });

    it("renders total amount and hides status when ledger entries exist", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="processing" />);
        // Should show total amount (50.00 CNY)
        const currencies = screen.getAllByText("CNY");
        expect(currencies.length).toBeGreaterThan(0);
        const amounts = screen.getAllByText(/50.00/);
        expect(amounts.length).toBeGreaterThan(0);

        // Should NOT show status "Processing..."
        const processingText = screen.queryByText("statusProcessing");
        expect(processingText).toBeNull();
    });

    it("renders '(待修正)' hint when currency is 'unknown'", () => {
        const entryWithNullCurrency = { ...mockLedgerEntry, currency: "unknown" };
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[entryWithNullCurrency]} isConfirmed={false} />);

        // The mock LedgerEntryCard renders "(待修正)" when issues exist and showStatusHint is true
        expect(screen.getByText("(待修正)")).toBeTruthy();
    });
});
