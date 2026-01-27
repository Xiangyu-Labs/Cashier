import { render, screen } from "@testing-library/react";
import { TransactionQueueStatus } from "@/components/ledger/TransactionQueueStatus";
import { describe, it, expect } from "vitest";
import { InputMessage } from "@/types/api";

describe("TransactionQueueStatus", () => {
    const mockMessages: InputMessage[] = [
        {
            id: "1",
            ledgerId: "test-ledger",
            text: "Lunch",
            imageUrls: [],
            status: "queued",
            aiResponse: null,
            createdAt: new Date().toISOString(),
        },
        {
            id: "2",
            ledgerId: "test-ledger",
            text: null,
            imageUrls: ["base64..."],
            status: "processing",
            aiResponse: null,
            createdAt: new Date().toISOString(),
        },
    ];

    it("renders nothing when queue is empty", () => {
        const { container } = render(<TransactionQueueStatus queuedMessages={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders queued messages", () => {
        render(<TransactionQueueStatus queuedMessages={mockMessages} />);

        expect(screen.getByText("Lunch")).toBeTruthy();
        expect(screen.getByText("排队中")).toBeTruthy();
        expect(screen.getByText("处理中")).toBeTruthy();
        expect(screen.getByText("[图片]")).toBeTruthy();
    });
});
