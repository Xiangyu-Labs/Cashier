import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SourceDocumentInput } from "@/features/source-document/components/SourceDocumentInput";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock dependencies
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/features/source-document/server/actions", () => ({
    createSourceDocumentAction: vi.fn(),
    retrySourceDocumentAction: vi.fn(),
}));

vi.mock("@/features/ledger/server/actions/get", () => ({
    getLedgerAction: vi.fn(),
}));

vi.mock("@/features/ledger/server/actions/update", () => ({
    updateLedgerAction: vi.fn(),
}));

import { createSourceDocumentAction, retrySourceDocumentAction } from "@/features/source-document/server/actions";

describe("SourceDocumentInput - Optimistic Close", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    it("should call onSuccess immediately when submitting in create mode", async () => {
        const onSuccess = vi.fn();

        // Mock create action to delay resolution
        vi.mocked(createSourceDocumentAction).mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({ sourceDocumentId: "test-id" }), 100))
        );

        render(
            <SourceDocumentInput
                ledgerId="ledger-123"
                mode="create"
                onSuccess={onSuccess}
            />,
            { wrapper }
        );

        // Type some text
        const textarea = screen.getByPlaceholderText("placeholder");
        fireEvent.change(textarea, { target: { value: "Test receipt" } });

        // Click send button
        const sendButton = screen.getByText(/send/i);
        fireEvent.click(sendButton);

        // onSuccess should be called immediately (optimistic close)
        expect(onSuccess).toHaveBeenCalledTimes(1);

        // Wait for mutation to complete
        await waitFor(() => {
            expect(createSourceDocumentAction).toHaveBeenCalled();
        });
    });

    it("should call onSuccess immediately when submitting in retry mode", async () => {
        const onSuccess = vi.fn();

        // Mock retry action to delay resolution
        vi.mocked(retrySourceDocumentAction).mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve({ sourceDocumentId: "new-id", status: "queued" }), 100))
        );

        render(
            <SourceDocumentInput
                ledgerId="ledger-123"
                mode="retry"
                sourceDocumentId="doc-123"
                initialData={{ text: "Original text" }}
                onSuccess={onSuccess}
            />,
            { wrapper }
        );

        // Modify text
        const textarea = screen.getByDisplayValue("Original text");
        fireEvent.change(textarea, { target: { value: "Updated text" } });

        // Click retry button
        const retryButton = screen.getByText(/retry/i);
        fireEvent.click(retryButton);

        // onSuccess should be called immediately (optimistic close)
        expect(onSuccess).toHaveBeenCalledTimes(1);

        // Wait for mutation to complete
        await waitFor(() => {
            expect(retrySourceDocumentAction).toHaveBeenCalled();
        });
    });

});
