import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SourceDocumentInput } from "@/modules/source-document/ui/SourceDocumentInput";
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

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: vi.fn(),
  retrySourceDocumentAction: vi.fn(),
}));

vi.mock("@/modules/ledger/actions", () => ({
  getLedgerAction: vi.fn(),
  updateLedgerAction: vi.fn(),
}));

import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { getLedgerAction } from "@/modules/ledger/actions";

describe("SourceDocumentInput - Optimistic Close", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLedgerAction).mockResolvedValue({
      id: "ledger-123",
      name: "Test Ledger",
      metadata: {},
    } as never);
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
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ sourceDocumentId: "test-id", status: "queued" }), 100)
        )
    );

    render(<SourceDocumentInput ledgerId="ledger-123" mode="create" onSuccess={onSuccess} />, {
      wrapper,
    });

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
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                sourceDocumentId: "new-id",
                previousSourceDocumentId: "doc-123",
                status: "queued",
              }),
            100
          )
        )
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

  it("opens the unified image modal on image click and keeps only the delete action", () => {
    render(
      <SourceDocumentInput
        ledgerId="ledger-123"
        mode="retry"
        initialData={{
          images: [
            {
              data: "data:image/png;base64,test-image",
              mimeType: "image/png",
            },
          ],
        }}
      />,
      { wrapper }
    );

    expect(screen.queryByRole("button", { name: "editImage" })).toBeNull();

    const deleteButton = screen.getByRole("button", { name: "delete" });
    expect(deleteButton.className).toContain("right-1");
    expect(deleteButton.className).toContain("top-1");

    fireEvent.click(screen.getByAltText("Uploaded 1"));

    expect(screen.getByRole("button", { name: "edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "close" })).toBeTruthy();
  });
});
