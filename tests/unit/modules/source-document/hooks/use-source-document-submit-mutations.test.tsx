import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSourceDocumentActionMock, retrySourceDocumentActionMock, toastErrorMock } =
  vi.hoisted(() => ({
    createSourceDocumentActionMock: vi.fn(),
    retrySourceDocumentActionMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: createSourceDocumentActionMock,
  retrySourceDocumentAction: retrySourceDocumentActionMock,
  createSourceDocumentUploadPlanAction: vi.fn(),
  finalizeSourceDocumentUploadAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

import type { SourceDocumentInputControllerMessages } from "@/modules/source-document/hooks/source-document-input-controller.types";
import { useSourceDocumentSubmitMutations } from "@/modules/source-document/hooks/useSourceDocumentSubmitMutations";

const messages: SourceDocumentInputControllerMessages = {
  uploadSuccess: "submitted",
  uploadError: "submit failed",
  retrySuccess: "retried",
  retryError: "retry failed",
  imageTooLarge: (fileName) => `large: ${fileName}`,
  imageUnsupported: (fileName) => `unsupported: ${fileName}`,
  imageReadError: "read failed",
  imageUploadError: "upload failed",
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
  });

  it("runs the success callback only after submission completes", async () => {
    let resolveSubmission!: () => void;
    const pendingSubmission = new Promise<void>((resolve) => {
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

    await act(async () => resolveSubmission());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
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
});
