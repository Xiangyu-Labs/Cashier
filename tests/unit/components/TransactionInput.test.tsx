import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionInput } from "@/components/ledger/TransactionInput";
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
}));

vi.mock("@/lib/api", () => ({
    createReceipt: vi.fn(),
}));

describe("TransactionInput", () => {
    it("renders text area and buttons", () => {
        render(<TransactionInput ledgerId="test-ledger" />);

        expect(screen.getByPlaceholderText(/输入消费记录/i)).toBeTruthy();
        expect(screen.getByText("图片")).toBeTruthy();
        expect(screen.getByText("发送")).toBeTruthy();
    });

    it("sends text message", async () => {
        const user = userEvent.setup();
        render(<TransactionInput ledgerId="test-ledger" />);

        const input = screen.getByPlaceholderText(/输入消费记录/i);
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
        const { container } = render(<TransactionInput ledgerId="test-ledger" />);

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
});
