import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceDocumentInput } from "@/components/ledger/SourceDocumentInput";
import { vi, describe, it, expect } from "vitest";

// Mock the API and React Query
const mockMutate = vi.fn();
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({
        invalidateQueries: vi.fn(),
    }),
    useMutation: () => ({
        mutate: mockMutate,
        isPending: false,
    }),
    useQuery: () => ({
        data: [], // Return empty array to support .some() and other array operations in useLedgerData
        isLoading: false,
    }),
}));

vi.mock("@/lib/api", () => ({
    createSourceDocument: vi.fn(),
    retrySourceDocument: vi.fn(),
    updateLedger: vi.fn(),
}));

describe("SourceDocumentInput", () => {
    it("renders text area and buttons", () => {
        render(<SourceDocumentInput ledgerId="test-ledger" />);

        expect(screen.getByPlaceholderText(/输入消费记录/)).toBeTruthy();
        expect(screen.getByText("图片")).toBeTruthy();
        expect(screen.getByText("发送")).toBeTruthy();
    });

    it("sends text message", async () => {
        const user = userEvent.setup();
        render(<SourceDocumentInput ledgerId="test-ledger" />);

        const input = screen.getByPlaceholderText(/输入消费记录/);
        await user.type(input, "Lunch 50");

        const sendButton = screen.getByText("发送");
        await user.click(sendButton);

        expect(mockMutate).toHaveBeenCalledWith({
            text: "Lunch 50",
            images: undefined,
        });
    });

    it("handles image upload", async () => {
        const user = userEvent.setup();
        const { container } = render(<SourceDocumentInput ledgerId="test-ledger" />);

        const file = new File(["(⌐□_□)"], "chucknorris.png", { type: "image/png" });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;

        if (!input) throw new Error("File input not found");

        await user.upload(input, file);

        // Should show image preview (we simply check if an image element appears)
        const images = await screen.findAllByRole("img");
        expect(images).toHaveLength(1); // One preview image

        const sendButton = screen.getByText("发送");
        await user.click(sendButton);

        expect(mockMutate).toHaveBeenCalledWith({
            text: undefined,
            images: expect.arrayContaining([
                expect.objectContaining({
                    mimeType: "image/png"
                })
            ]),
        });
    });

    it("renders initial data and shows retry button in retry mode", () => {
        const initialData = {
            text: "Initial text",
            images: [{ data: "data:image/png;base64,abc", mimeType: "image/png" }]
        };

        render(
            <SourceDocumentInput
                ledgerId="test-ledger"
                mode="retry"
                sourceDocumentId="doc-123"
                initialData={initialData}
            />
        );

        expect(screen.getByDisplayValue("Initial text")).toBeTruthy();
        // Check for preview image
        const img = screen.getByRole("img");
        expect(img.getAttribute("src")).toBe("data:image/png;base64,abc");

        // Should show retry button instead of send
        expect(screen.queryByText("发送")).toBeNull();
        expect(screen.getByText("重试")).toBeTruthy();

        // Should show advanced features (now visible in both modes)
        expect(screen.getByText("高级功能")).toBeTruthy();
    });

    it("calls retry mutation in retry mode", async () => {
        const user = userEvent.setup();
        const initialData = { text: "Fixing this" };

        render(
            <SourceDocumentInput
                ledgerId="test-ledger"
                mode="retry"
                sourceDocumentId="doc-123"
                initialData={initialData}
            />
        );

        const retryButton = screen.getByText("重试");
        await user.click(retryButton);

        expect(mockMutate).toHaveBeenCalledWith({
            text: "Fixing this",
            images: undefined
        });
    });
});
