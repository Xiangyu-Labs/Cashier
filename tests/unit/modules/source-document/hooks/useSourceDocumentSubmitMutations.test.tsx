import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useSourceDocumentSubmitMutations } from "@/modules/source-document/hooks/useSourceDocumentSubmitMutations";

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentAction: vi.fn(),
  retrySourceDocumentAction: vi.fn(),
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

describe("useSourceDocumentSubmitMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits create payloads, cancels only the exact pending key, and invalidates source document and task queue queries on settle", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const cancelQueriesSpy = vi.spyOn(queryClient, "cancelQueries");
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(createSourceDocumentAction).mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    } as never);

    const { result } = renderHook(
      () =>
        useSourceDocumentSubmitMutations({
          ledgerId: "ledger-1",
          mode: "create",
          messages: createMessages(),
        }),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      expect(
        result.current.submit({
          entryDate: "2026-03-20T12:00:00.000Z",
          text: "Lunch",
        })
      ).toBe(true);
    });

    await waitFor(() => {
      expect(createSourceDocumentAction).toHaveBeenCalledWith("ledger-1", {
        entryDate: "2026-03-20T12:00:00.000Z",
        text: "Lunch",
      });
    });

    await waitFor(() => {
      expect(cancelQueriesSpy).toHaveBeenCalled();
    });

    const cancelPredicate = cancelQueriesSpy.mock.calls[0]?.[0].predicate;
    expect(cancelPredicate).toBeTypeOf("function");
    expect(cancelPredicate?.({ queryKey: queryKeys.sourceDocuments("ledger-1", "pending") })).toBe(
      true
    );
    expect(cancelPredicate?.({ queryKey: queryKeys.sourceDocuments("ledger-1", "queued") })).toBe(
      false
    );

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalled();
    });

    const invalidationPredicates = invalidateQueriesSpy.mock.calls.map((call) => call[0].predicate);
    expect(
      invalidationPredicates.some((predicate) =>
        predicate?.({ queryKey: queryKeys.sourceDocuments("ledger-1", "pending") })
      )
    ).toBe(true);
    expect(
      invalidationPredicates.some((predicate) =>
        predicate?.({ queryKey: queryKeys.taskQueue("ledger-1") })
      )
    ).toBe(true);
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
        useSourceDocumentSubmitMutations({
          ledgerId: "ledger-1",
          mode: "retry",
          sourceDocumentId: "doc-1",
          messages: createMessages(),
        }),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      expect(
        result.current.submit({
          entryDate: "2026-03-20T12:00:00.000Z",
          text: "Edited retry text",
        })
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<{ status: string; text: string }>(
          queryKeys.sourceDocument("doc-1")
        )
      ).toMatchObject({
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
  });

  it("returns false and does not submit retry when sourceDocumentId is missing", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useSourceDocumentSubmitMutations({
          ledgerId: "ledger-1",
          mode: "retry",
          messages: createMessages(),
        }),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      expect(
        result.current.submit({
          entryDate: "2026-03-20T12:00:00.000Z",
          text: "Lunch",
        })
      ).toBe(false);
    });

    expect(retrySourceDocumentAction).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });
});
