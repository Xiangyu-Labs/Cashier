import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchSourceDocumentActions } from "@/modules/source-document/hooks/useBatchSourceDocumentActions";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";

const {
  deleteSourceDocumentActionMock,
  acceptSourceDocumentCandidateActionMock,
  abandonSourceDocumentCandidateActionMock,
  retrySourceDocumentActionMock,
  toastSuccessMock,
  toastErrorMock,
  toastWarningMock,
} = vi.hoisted(() => ({
  deleteSourceDocumentActionMock: vi.fn(),
  acceptSourceDocumentCandidateActionMock: vi.fn(),
  abandonSourceDocumentCandidateActionMock: vi.fn(),
  retrySourceDocumentActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, warning: toastWarningMock },
}));

vi.mock("@/modules/source-document/actions", () => ({
  acceptSourceDocumentCandidateAction: acceptSourceDocumentCandidateActionMock,
  abandonSourceDocumentCandidateAction: abandonSourceDocumentCandidateActionMock,
  batchUpdateSourceDocumentsAction: vi.fn(),
  batchDeleteSourceDocumentsAction: vi.fn(),
  batchResolveDuplicateReviewsAction: vi.fn(),
  batchRetrySourceDocumentsAction: vi.fn(),
  deleteSourceDocumentAction: deleteSourceDocumentActionMock,
  retrySourceDocumentAction: retrySourceDocumentActionMock,
  cancelSourceDocumentProcessingAction: vi.fn(),
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

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
) {
  return function ToastFeedbackTestWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
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

  it("finishes list deletion before the derived-query refresh settles", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    deleteSourceDocumentActionMock.mockResolvedValueOnce(undefined);
    const clearSelection = vi.fn();
    const { result } = renderHook(() => useBatchSourceDocumentActions("ledger-1", clearSelection), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.deleteSourceDocument.mutateAsync("document-1")
      ).resolves.toBeUndefined();
    });

    expect(result.current.deleteSourceDocument.isPending).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("deleteSuccess");
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(toastWarningMock).not.toHaveBeenCalled();

    await act(async () => refreshGate.resolve());
  });

  it("warns once when a detached list refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(new Error("offline"));
    deleteSourceDocumentActionMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useBatchSourceDocumentActions("ledger-1", vi.fn()), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deleteSourceDocument.mutateAsync("document-1");
    });

    await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
    expect(toastWarningMock).toHaveBeenCalledWith("savedRefreshFailed");
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("finishes candidate acceptance before its refresh settles", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    acceptSourceDocumentCandidateActionMock.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useSourceDocumentRecoveryMutations({
          ledgerId: "ledger-1",
          sourceDocumentId: "document-1",
          revisionId: "revision-1",
          onSuccess,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await expect(result.current.acceptCandidate()).resolves.toBeUndefined();
    });

    expect(result.current.isAccepting).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("acceptSuccess");
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await act(async () => refreshGate.resolve());
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
