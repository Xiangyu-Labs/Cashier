import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { queryKeys } from "@/lib/query-keys";
import { compressImage } from "@/lib/image-utils";
import { createSourceDocumentAction, retrySourceDocumentAction } from "@/modules/source-document/actions";
import { toast } from "sonner";
import { useSourceDocumentInputController } from "@/modules/source-document/hooks/useSourceDocumentInputController";

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: vi.fn(),
  retrySourceDocumentAction: vi.fn(),
}));

vi.mock("@/lib/image-utils", () => ({
  compressImage: vi.fn(),
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateTimeForApi: vi.fn(() => "2026-03-20T12:00:00.000Z"),
  parseDateString: vi.fn((dateStr: string) => new Date(`${dateStr}T00:00:00.000Z`)),
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
    imageTooLarge: (fileName: string) => `Image too large: ${fileName}. Please use a smaller image.`,
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
  const originalFileReader = globalThis.FileReader;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.FileReader = originalFileReader;
  });

  it("does not overwrite user edits when initialData changes for the same document", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result, rerender } = renderHook(
      (props: {
        sourceDocumentId?: string;
        initialData?: {
          text?: string;
          images?: Array<{ data: string; mimeType: string }>;
          entryDate?: string;
        };
      }) =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "retry",
          messages: createMessages(),
          ...props,
        }),
      {
        initialProps: {
          sourceDocumentId: "doc-1",
          initialData: { text: "Original text" },
        },
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.setText("User edited text");
    });

    rerender({
      sourceDocumentId: "doc-1",
      initialData: { text: "Server update" },
    });

    expect(result.current.text).toBe("User edited text");
  });

  it("reinitializes draft state when switching to a different document", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result, rerender } = renderHook(
      (props: {
        sourceDocumentId?: string;
        initialData?: {
          text?: string;
          images?: Array<{ data: string; mimeType: string }>;
          entryDate?: string;
        };
      }) =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "retry",
          messages: createMessages(),
          ...props,
        }),
      {
        initialProps: {
          sourceDocumentId: "doc-1",
          initialData: {
            text: "Document A",
            images: [{ data: "image-a", mimeType: "image/png" }],
            entryDate: "2026-03-18",
          },
        },
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.setText("User edits");
      result.current.setEntryDate(new Date("2026-03-20T00:00:00.000Z"));
    });

    rerender({
      sourceDocumentId: "doc-2",
      initialData: {
        text: "Document B",
        images: [{ data: "image-b", mimeType: "image/jpeg" }],
        entryDate: "2026-03-19",
      },
    });

    await waitFor(() => {
      expect(result.current.text).toBe("Document B");
    });
    expect(result.current.images).toEqual([{ data: "image-b", mimeType: "image/jpeg" }]);
    expect(result.current.entryDate.getTime()).toBe(new Date("2026-03-19T00:00:00.000Z").getTime());
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

  it("optimistically marks retry documents as processing and rolls back on failure", async () => {
    const deferred = createDeferred<void>();
    vi.mocked(retrySourceDocumentAction).mockReturnValue(deferred.promise as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(queryKeys.sourceDocument("doc-1"), {
      id: "doc-1",
      status: "failed",
      text: "Original retry text",
    });

    const { result } = renderHook(
      () =>
        useSourceDocumentInputController({
          ledgerId: "ledger-1",
          mode: "retry",
          sourceDocumentId: "doc-1",
          initialData: { text: "Original retry text" },
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.setText("Edited retry text");
    });

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(retrySourceDocumentAction).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<{ status: string; text: string }>(queryKeys.sourceDocument("doc-1")))
        .toMatchObject({
          status: "processing",
          text: "Edited retry text",
        });
    });

    deferred.reject(new Error("Retry failed"));
    await deferred.promise.catch(() => undefined);

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.sourceDocument("doc-1"))).toMatchObject({
        id: "doc-1",
        status: "failed",
        text: "Original retry text",
      });
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to retry");
  });

  it("includes originalImages only when a modal edit changes image data", async () => {
    vi.mocked(createSourceDocumentAction).mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    } as never);

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
            images: [{ data: "original-image", mimeType: "image/png" }],
          },
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.handleModalSave([{ data: "edited-image", mimeType: "image/png" }]);
    });

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(createSourceDocumentAction).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(createSourceDocumentAction).mock.calls[0]).toEqual([
      "ledger-1",
      {
        entryDate: "2026-03-20T12:00:00.000Z",
        images: [{ data: "edited-image", mimeType: "image/png" }],
        originalImages: [{ data: "original-image", mimeType: "image/png" }],
      },
    ]);
  });

  it("omits originalImages when no image edit happened", async () => {
    vi.mocked(createSourceDocumentAction).mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    } as never);

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
            text: "No image edits",
            images: [{ data: "original-image", mimeType: "image/png" }],
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

    expect(vi.mocked(createSourceDocumentAction).mock.calls[0]).toEqual([
      "ledger-1",
      {
        entryDate: "2026-03-20T12:00:00.000Z",
        text: "No image edits",
        images: [{ data: "original-image", mimeType: "image/png" }],
      },
    ]);
  });

  it("initializes entryDate from initialData and formats the selected date on submit", async () => {
    vi.mocked(createSourceDocumentAction).mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    } as never);

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
            entryDate: "2026-03-21",
          },
          messages: createMessages(),
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    expect(vi.mocked(parseDateString)).toHaveBeenCalledWith("2026-03-21");
    expect(result.current.entryDate.getTime()).toBe(new Date("2026-03-21T00:00:00.000Z").getTime());

    const selectedDate = new Date("2026-03-22T00:00:00.000Z");
    act(() => {
      result.current.setEntryDate(selectedDate);
    });

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(createSourceDocumentAction).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(formatDateTimeForApi)).toHaveBeenCalledWith(selectedDate);
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

  it("falls back to FileReader when compression fails for small files", async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error("Compression failed"));

    class MockFileReader {
      result: string | ArrayBuffer | null = "data:image/webp;base64,fallback-image";
      error: DOMException | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

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

    const file = new File(["small"], "small.png", { type: "image/png" });
    act(() => {
      result.current.handleFileInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(result.current.images).toEqual([
        { data: "data:image/webp;base64,fallback-image", mimeType: "image/webp" },
      ]);
    });
  });

  it("rejects oversized files after compression fallback and shows an error toast", async () => {
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
