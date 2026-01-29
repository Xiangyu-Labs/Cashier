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
}));

describe("SourceDocumentInput", () => {
    it("renders text area and buttons", () => {
        render(<SourceDocumentInput ledgerId="test-ledger" />);

        expect(screen.getByPlaceholderText("placeholder")).toBeTruthy();
        expect(screen.getByText("image")).toBeTruthy();
        expect(screen.getByText("send")).toBeTruthy();
    });

    it("sends text message", async () => {
        const user = userEvent.setup();
        render(<SourceDocumentInput ledgerId="test-ledger" />);

        const input = screen.getByPlaceholderText("placeholder");
        await user.type(input, "Lunch 50");

        const sendButton = screen.getByText("send");
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

        const sendButton = screen.getByText("send");
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
});
