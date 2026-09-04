import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceDocumentCandidateReviewDialog } from "@/modules/source-document/ui/SourceDocumentCandidateReviewDialog";
import { queryKeys } from "@/lib/query-keys";

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
      version: 1,
      active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
      candidate: { revisionId: "rev-2", entries: [], entryCount: 0, total: "0" },
    });
    abandonActionMock.mockResolvedValue({
      ok: true,
      sourceDocumentId: "doc-1",
      version: 2,
      data: { status: "completed" },
    });
    acceptActionMock.mockResolvedValue({
      ok: true,
      sourceDocumentId: "doc-1",
      version: 2,
      data: { status: "completed" },
    });
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

  it("disables decisions while stale review data is refetching or errored", async () => {
    reviewActionMock
      .mockResolvedValueOnce({
        sourceDocumentId: "doc-1",
        version: 1,
        active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
        candidate: { revisionId: "rev-2", entries: [], entryCount: 0, total: "0" },
      })
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({
        sourceDocumentId: "doc-1",
        version: 2,
        active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
        candidate: { revisionId: "rev-2", entries: [], entryCount: 0, total: "0" },
      });
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

    const accept = await screen.findByRole("button", { name: "接受新结果" });
    await waitFor(() => expect(accept).not.toBeDisabled());

    void queryClient.invalidateQueries({
      queryKey: queryKeys.sourceDocumentCandidateReview("ledger-1", "doc-1"),
    });
    await waitFor(() => expect(reviewActionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(accept).toBeDisabled());
    expect(await screen.findByText("该审核已不可用。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(reviewActionMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(accept).not.toBeDisabled());
  });

  it("does not abandon a replacement candidate after confirmation opens", async () => {
    reviewActionMock
      .mockResolvedValueOnce({
        sourceDocumentId: "doc-1",
        version: 1,
        active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
        candidate: { revisionId: "rev-2", entries: [], entryCount: 0, total: "0" },
      })
      .mockResolvedValueOnce({
        sourceDocumentId: "doc-1",
        version: 2,
        active: { revisionId: "rev-1", entries: [], entryCount: 0, total: "0" },
        candidate: { entries: [], entryCount: 0, total: "0" },
      });
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
    await queryClient.refetchQueries({
      queryKey: queryKeys.sourceDocumentCandidateReview("ledger-1", "doc-1"),
    });
    await waitFor(() => expect(reviewActionMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ version: number }>(
          queryKeys.sourceDocumentCandidateReview("ledger-1", "doc-1")
        )?.version
      ).toBe(2)
    );

    await waitFor(() =>
      expect(screen.queryByText("新的解析结果将被丢弃，当前账目不会改变。")).not.toBeInTheDocument()
    );
    expect(abandonActionMock).not.toHaveBeenCalled();
  });
});
