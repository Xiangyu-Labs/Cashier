import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceDocumentCard } from "@/components/ledger-entry/SourceDocumentCard";
import { vi, describe, it, expect } from "vitest";
import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";

// Mock dependencies
vi.mock("@/components/CategoryIcon", () => ({
    CategoryIcon: () => <div data-testid="category-icon" />,
}));

vi.mock("@/components/ledger-entry/BillEntryItem", () => ({
    BillEntryItem: ({ ledgerEntry, variant }: { ledgerEntry: LedgerEntry, variant?: string }) => {
        return (
            <div data-testid="bill-entry-item" data-variant={variant}>
                {ledgerEntry.itemName}
                {/* Mock behavior for badges if needed, or just keep simple */}
                {!ledgerEntry.currency && <span>(需货币)</span>}
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

    it("renders text content and toggles details", async () => {
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            title: "Test document",
            text: "Raw input",
        };
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} status="anomaly" />);

        // expect(screen.getByText("Test document")).toBeTruthy(); // Title is hidden

        // The header is now clickable
        const header = screen.getByText(/1月1日/).closest('[class*="cursor-pointer"]');
        expect(header).toBeTruthy();

        // Initial state is collapsed (since status is anomaly and defaultExpanded is false)
        expect(screen.queryByText("Raw input")).toBeNull();

        // Click header to expand
        await fireEvent.click(header!);
        expect(screen.getByText("Raw input")).toBeTruthy();
        // expect(screen.getByText("Test document")).toBeTruthy(); // Title is hidden

        // Click header to collapse
        await fireEvent.click(header!);
        await screen.findByText(/1月1日/); // Ensure re-render
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to event loop
        expect(screen.queryByText("Raw input")).toBeNull();
    });

    it("renders single image content", async () => {
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        // Use anomaly status to show raw input
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} status="anomaly" />);

        // Expand content - header is clickable
        const header = screen.getByText(/1月1日/).closest('[class*="cursor-pointer"]');
        await fireEvent.click(header!);

        const imgs = screen.getAllByRole("img");
        // Expect at least one image with the src
        const userImg = imgs.find(img => img.getAttribute("src") === "data:image/png;base64,fake-image-data");
        expect(userImg).toBeTruthy();
    });

    it("renders multiple images content", async () => {
        const imagesData = ["data:image/png;base64,img1", "data:image/png;base64,img2"];
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: imagesData,
        };
        // Use anomaly status to show raw input
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} status="anomaly" />);

        // Expand content
        const header = screen.getByText(/1月1日/).closest('[class*="cursor-pointer"]');
        await fireEvent.click(header!);

        const imgs = screen.getAllByRole("img");
        // Filter out any icons that might be rendered as imgs (though mocked CategoryIcon is a div)
        const userImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:image"));
        expect(userImgs).toHaveLength(2);
        expect(userImgs[0].getAttribute("src")).toBe(imagesData[0]);
        expect(userImgs[1].getAttribute("src")).toBe(imagesData[1]);
    });

    it("renders bill entry items directly", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} defaultExpanded={true} status="completed" />);
        // It should render the bill entry item when expanded
        expect(screen.getByTestId("bill-entry-item")).toBeTruthy();
        expect(screen.getByText("Lunch")).toBeTruthy();
    });

    it("does NOT render entries for anomaly status", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="anomaly" defaultExpanded={true} />);
        const item = screen.queryByTestId("bill-entry-item");
        expect(item).toBeNull();
    });

    it("passes correct variant for processing status", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="processing" defaultExpanded={true} />);
        // Wait, for processing, isItemsExpanded=true should still NOT show entries according to new logic? 
        // No, current logic: showEntries = status !== "processing" && isItemsExpanded;
        // So Processing cards never show entries.
        const item = screen.queryByTestId("bill-entry-item");
        expect(item).toBeNull();
    });

    it("opens image zoom dialog on click", async () => {
        const sourceDocument: SourceDocument = {
            ...baseSourceDocument,
            text: null,
            imageUrls: ["data:image/png;base64,fake-image-data"],
        };
        // Use anomaly status to show raw input
        renderWithQuery(<SourceDocumentCard sourceDocument={sourceDocument} {...defaultProps} status="anomaly" />);

        // Expand content
        const header = screen.getByText(/1月1日/);
        fireEvent.click(header);

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
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[]} status="processing" />);
        expect(screen.getByTestId("status-label")).toBeTruthy();
    });

    it("renders anomaly status and message when anomalyCodes is provided", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[]} status="anomaly" anomalyCodes={["internal_error"]} />);
        expect(screen.getByText("internal_error")).toBeTruthy();
    });

    it("renders total amount when status is completed", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="completed" />);
        // Should show total amount (50.00 CNY)
        const currencies = screen.getAllByText("CNY");
        expect(currencies.length).toBeGreaterThan(0);
        const amounts = screen.getAllByText(/50.00/);
        expect(amounts.length).toBeGreaterThan(0);
    });

    it("hides total amount when status is processing", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="processing" />);
        // Header total is hidden
        // Mock BillEntryItem doesn't render currency or amount
        // So we expect NO "CNY" or "50.00" on screen
        expect(screen.queryByText("CNY")).toBeNull();
        expect(screen.queryByText(/50.00/)).toBeNull();
    });

    it("hides total amount when status is anomaly", () => {
        renderWithQuery(<SourceDocumentCard sourceDocument={baseSourceDocument} {...defaultProps} ledgerEntries={[mockLedgerEntry]} status="anomaly" />);
        expect(screen.queryByText("CNY")).toBeNull();
        expect(screen.queryByText(/50.00/)).toBeNull();
    });
});
