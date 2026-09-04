import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useLedgerMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the local callback, success toast, and invalidation in order", async () => {
    const { queryClient, wrapper } = setup();
    const order: string[] = [];
    toastSuccessMock.mockImplementation(() => order.push("toast"));
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
    });

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: "Saved",
          onSuccess: async () => {
            order.push("callback");
          },
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync()).resolves.toBe("saved");
    });

    expect(order).toEqual(["callback", "toast", "invalidate"]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("remains pending until ledger invalidation settles", async () => {
    const { queryClient, wrapper } = setup();
    let resolveInvalidation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      resolveInvalidation = resolve;
    });
    vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(invalidation);

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
        }),
      { wrapper }
    );

    let mutation!: Promise<string>;
    act(() => {
      mutation = result.current.mutateAsync();
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      resolveInvalidation();
      await mutation;
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("keeps a successful write successful when invalidation rejects", async () => {
    const { queryClient, wrapper } = setup();
    vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(new Error("offline"));

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: "Saved",
          errorMessage: "Failed",
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync()).resolves.toBe("saved");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccessMock).toHaveBeenCalledWith("Saved");
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Saved, but the latest data could not be refreshed. Retry."
    );
  });

  it("retries ledger invalidation once after one second", async () => {
    vi.useFakeTimers();
    try {
      const { queryClient, wrapper } = setup();
      const invalidate = vi
        .spyOn(queryClient, "invalidateQueries")
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce();
      const { result } = renderHook(
        () =>
          useLedgerMutation("ledger-1", {
            mutationFn: async () => "saved",
            successMessage: null,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.mutateAsync();
      });
      expect(invalidate).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(invalidate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a server write failure and still invalidates the ledger root", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => {
            throw new Error("write failed");
          },
          errorMessage: "Failed",
          onError,
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow("write failed");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastErrorMock).toHaveBeenCalledWith("Failed");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), undefined);
    expect(invalidate).toHaveBeenCalled();
  });

  it("does not refetch inactive ledger queries", async () => {
    const { queryClient, wrapper } = setup();
    const queryFn = vi.fn(async () => "cached");
    await queryClient.fetchQuery({
      queryKey: ["ledger", "ledger-1", "inactive"],
      queryFn,
    });
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("refetches an active ordinary query at most once", async () => {
    const { wrapper } = setup();
    const queryFn = vi.fn(async () => "fresh");
    const { result } = renderHook(
      () => ({
        query: useQuery({ queryKey: ["ledger", "ledger-1", "active"], queryFn }),
        mutation: useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
        }),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.mutation.mutateAsync();
    });

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("keeps a five-page active infinite stream within the refetch budget", async () => {
    const { wrapper } = setup();
    const queryFn = vi.fn(async ({ pageParam }: { pageParam: number }) => pageParam);
    const { result } = renderHook(
      () => ({
        stream: useInfiniteQuery({
          queryKey: ["ledger", "ledger-1", "source-documents", "stream"],
          queryFn,
          initialPageParam: 0,
          getNextPageParam: (lastPage) => (lastPage < 4 ? lastPage + 1 : undefined),
        }),
        mutation: useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
        }),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.stream.isSuccess).toBe(true));
    for (let page = 1; page < 5; page += 1) {
      await act(async () => {
        await result.current.stream.fetchNextPage();
      });
    }
    expect(queryFn).toHaveBeenCalledTimes(5);

    await act(async () => {
      await result.current.mutation.mutateAsync();
    });

    expect(queryFn.mock.calls.length).toBeLessThanOrEqual(12);
  });
});
