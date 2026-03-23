import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/image-utils";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { toast } from "sonner";
import { useSourceDocumentInputController } from "@/modules/source-document/hooks/useSourceDocumentInputController";

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: vi.fn(),
  retrySourceDocumentAction: vi.fn(),
}));

vi.mock("@/lib/image-utils", () => ({
  compressImage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createMessages() {
  return {
    uploadSuccess: "Submitted successfully",
    uploadError: "Failed to submit",
    retrySuccess: "Retry submitted",
    retryError: "Failed to retry",
    imageTooLarge: (fileName: string) =>
      `Image too large: ${fileName}. Please use a smaller image.`,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("useSourceDocumentInputController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps create draft intact while the request is pending", async () => {
    const deferred = createDeferred<{ sourceDocumentId: string; status: string }>();
    vi.mocked(createSourceDocumentAction).mockReturnValue(deferred.promise as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "create",
          initialData: {
            text: "Lunch",
            images: [{ data: "image-1", mimeType: "image/png" }],
          },
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(createSourceDocumentAction).toHaveBeenCalledTimes(1);
    });

    expect(result.current.text).toBe("Lunch");
    expect(result.current.images).toEqual([{ data: "image-1", mimeType: "image/png" }]);

    deferred.resolve({ sourceDocumentId: "doc-1", status: "queued" });
    await deferred.promise;
  });

  it("does not call onSuccess when retry submit is blocked without sourceDocumentId", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "retry",
          initialData: { text: "Retry text" },
          onSuccess,
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(retrySourceDocumentAction).not.toHaveBeenCalled();
  });

  it("appends images from both file upload and paste flows", async () => {
    vi.mocked(compressImage)
      .mockResolvedValueOnce({ data: "upload-image", mimeType: "image/png" } as never)
      .mockResolvedValueOnce({ data: "paste-image", mimeType: "image/jpeg" } as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "create",
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    const uploadFile = new File(["upload"], "upload.png", { type: "image/png" });
    act(() => {
      result.current.handleFileInputChange({
        target: { files: [uploadFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(result.current.images).toEqual([{ data: "upload-image", mimeType: "image/png" }]);
    });

    const pastedFile = new File(["paste"], "paste.jpg", { type: "image/jpeg" });
    act(() => {
      result.current.handleTextareaPaste({
        clipboardData: {
          items: [
            {
              type: "image/jpeg",
              getAsFile: () => pastedFile,
            },
          ],
        },
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    await waitFor(() => {
      expect(result.current.images).toEqual([
        { data: "upload-image", mimeType: "image/png" },
        { data: "paste-image", mimeType: "image/jpeg" },
      ]);
    });
  });

  it("shows an error toast when the loader reports an oversized image", async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error("Compression failed"));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "create",
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    const file = new File(["tiny"], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", {
      value: 5 * 1024 * 1024 + 1,
      configurable: true,
    });

    act(() => {
      result.current.handleFileInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Image too large: huge.png. Please use a smaller image."
      );
    });

    expect(result.current.images).toEqual([]);
  });
});
