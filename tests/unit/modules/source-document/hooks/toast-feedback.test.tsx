import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchSourceDocumentActions } from "@/modules/source-document/hooks/useBatchSourceDocumentActions";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";

const {
  deleteSourceDocumentActionMock,
  retrySourceDocumentActionMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  deleteSourceDocumentActionMock: vi.fn(),
  retrySourceDocumentActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock("@/modules/source-document/actions", () => ({
  acceptSourceDocumentCandidateAction: vi.fn(),
  abandonSourceDocumentCandidateAction: vi.fn(),
  batchUpdateSourceDocumentsAction: vi.fn(),
  deleteSourceDocumentAction: deleteSourceDocumentActionMock,
  retrySourceDocumentAction: retrySourceDocumentActionMock,
}));

vi.mock("@/modules/source-document/hooks/source-document-optimistic-cache", () => ({
  applyOptimisticDelete: vi.fn(),
  applyOptimisticUpsert: vi.fn(),
  applySourceDocumentReconciliation: vi.fn(),
  getStreamQueryMatches: vi.fn(() => []),
}));

vi.mock("@/modules/source-document/hooks/revision-state-refresh", () => ({
  notifyNewSubmission: vi.fn(),
  useNotifyRevisionRefresh: () => vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return function ToastFeedbackTestWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("source document mutation toast ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports list deletion success and failure exactly once", async () => {
    const clearSelection = vi.fn();
    const { result } = renderHook(() => useBatchSourceDocumentActions("ledger-1", clearSelection), {
      wrapper: createWrapper(),
    });

    deleteSourceDocumentActionMock.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.deleteSourceDocument.mutateAsync("document-1");
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("deleteSuccess");
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(clearSelection).toHaveBeenCalledTimes(1);

    deleteSourceDocumentActionMock.mockRejectedValueOnce(new Error("delete failed"));
    await act(async () => {
      await expect(result.current.deleteSourceDocument.mutateAsync("document-2")).rejects.toThrow(
        "delete failed"
      );
    });

    expect(toastErrorMock).toHaveBeenCalledWith("deleteFailed");
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });

  it("reports direct retry success and failure exactly once", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useSourceDocumentRecoveryMutations({
          ledgerId: "ledger-1",
          sourceDocumentId: "document-1",
          onSuccess,
        }),
      { wrapper: createWrapper() }
    );

    retrySourceDocumentActionMock.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.retry();
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("retrySuccess", {
      description: "retrySuccessDescription",
    });
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    retrySourceDocumentActionMock.mockRejectedValueOnce(new Error("retry failed"));
    await act(async () => {
      await expect(result.current.retry()).rejects.toThrow("retry failed");
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("retryError", {
        description: "retryErrorDescription",
      })
    );
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });
});
