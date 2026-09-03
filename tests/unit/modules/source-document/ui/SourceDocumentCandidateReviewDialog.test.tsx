import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceDocumentCandidateReviewDialog } from "@/modules/source-document/ui/SourceDocumentCandidateReviewDialog";

const { reviewActionMock, abandonActionMock, acceptActionMock } = vi.hoisted(() => ({
  reviewActionMock: vi.fn(),
  abandonActionMock: vi.fn(),
  acceptActionMock: vi.fn(),
}));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentCandidateReviewAction: (...args: unknown[]) => reviewActionMock(...args),
  abandonSourceDocumentCandidateAction: (...args: unknown[]) => abandonActionMock(...args),
  acceptSourceDocumentCandidateAction: (...args: unknown[]) => acceptActionMock(...args),
  cancelSourceDocumentProcessingAction: vi.fn(),
  retrySourceDocumentAction: vi.fn(),
}));

describe("SourceDocumentCandidateReviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewActionMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
      candidate: { revisionId: "rev-2", entries: [], entryCount: 0, total: "0" },
    });
    abandonActionMock.mockResolvedValue({ status: "abandoned" });
  });

  it("requires confirmation before abandoning the candidate", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SourceDocumentCandidateReviewDialog
          ledgerId="ledger-1"
          sourceDocumentId="doc-1"
          open
          onOpenChange={vi.fn()}
          mainCurrency="CNY"
        />
      </QueryClientProvider>
    );

    const abandon = await screen.findByRole("button", { name: "保留原结果" });
    await waitFor(() => expect(abandon).not.toBeDisabled());
    fireEvent.click(abandon);
    expect(abandonActionMock).not.toHaveBeenCalled();
    expect(screen.getByText("新的解析结果将被丢弃，当前账目不会改变。")).toBeInTheDocument();

    const confirmations = screen.getAllByRole("button", { name: "保留原结果" });
    fireEvent.click(confirmations.at(-1)!);
    await waitFor(() => expect(abandonActionMock).toHaveBeenCalledTimes(1));
  });
});
