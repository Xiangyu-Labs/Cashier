import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSourceDocumentActionMock,
  retrySourceDocumentActionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createSourceDocumentActionMock: vi.fn(),
  retrySourceDocumentActionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: createSourceDocumentActionMock,
  retrySourceDocumentAction: retrySourceDocumentActionMock,
  createSourceDocumentUploadPlanAction: vi.fn(),
  finalizeSourceDocumentUploadAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

import type { SourceDocumentInputControllerMessages } from "@/modules/source-document/hooks/source-document-input-controller.types";
import { useSourceDocumentSubmitMutations } from "@/modules/source-document/hooks/useSourceDocumentSubmitMutations";

const messages: SourceDocumentInputControllerMessages = {
  uploadError: "submit failed",
  retrySuccess: "retried",
  retryError: "retry failed",
  imageTooLarge: (fileName) => `large: ${fileName}`,
  imageUnsupported: (fileName) => `unsupported: ${fileName}`,
  imageReadError: "read failed",
  imageUploadError: "upload failed",
  tooManyImages: "too many images",
};

function setup(onSuccess: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useSourceDocumentSubmitMutations({
        ledgerId: "ledger-1",
        mode: "create",
        messages,
        onSuccess,
      }),
    { wrapper }
  );
}

describe("useSourceDocumentSubmitMutations", () => {
  beforeEach(() => {
    createSourceDocumentActionMock.mockReset();
    retrySourceDocumentActionMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the success callback only after submission completes", async () => {
    let resolveSubmission!: (result: {
      sourceDocumentId: string;
      revisionId: string;
      revisionState: "processing";
    }) => void;
    const pendingSubmission = new Promise<{
      sourceDocumentId: string;
      revisionId: string;
      revisionState: "processing";
    }>((resolve) => {
      resolveSubmission = resolve;
    });
    createSourceDocumentActionMock.mockReturnValue(pendingSubmission);
    const onSuccess = vi.fn();
    const { result } = setup(onSuccess);

    act(() => {
      result.current.submit({ entryDate: "2026-07-17", text: "Lunch" });
    });
    await waitFor(() => expect(createSourceDocumentActionMock).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () =>
      resolveSubmission({
        sourceDocumentId: "source-1",
        revisionId: "revision-1",
        revisionState: "processing",
      })
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({
      sourceDocumentId: "source-1",
      entryDate: "2026-07-17",
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("keeps the form open and reports a submission failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createSourceDocumentActionMock.mockRejectedValue(new Error("server unavailable"));
    const onSuccess = vi.fn();
    const { result } = setup(onSuccess);

    act(() => {
      result.current.submit({ entryDate: "2026-07-17", text: "Lunch" });
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("submit failed"));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("cancels before the deferred mutation starts", async () => {
    let startMutation: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        startMutation = callback;
        return 1;
      })
    );
    const onSuccess = vi.fn();
    const { result } = setup(onSuccess);

    act(() => {
      result.current.submit({ entryDate: "2026-07-17", text: "Lunch" });
    });
    expect(result.current.canCancel).toBe(true);

    act(() => result.current.cancel());
    expect(result.current.progress?.phase).toBe("cancelling");
    expect(result.current.canCancel).toBe(false);

    act(() => startMutation?.(0));
    await waitFor(() => expect(result.current.progress).toBeNull());
    expect(createSourceDocumentActionMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
