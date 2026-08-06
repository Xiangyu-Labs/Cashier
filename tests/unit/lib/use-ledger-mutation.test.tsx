import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

describe("useLedgerMutation cache targeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps cached server data unchanged until the request succeeds", async () => {
    const { queryClient, wrapper } = setup();
    const queryKey = ["affected", "ledger-1"] as const;
    queryClient.setQueryData(queryKey, [{ id: "old", name: "Original" }]);
    let resolveRequest!: () => void;
    const request = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: () => request,
          successMessage: null,
          errorMessage: null,
        }),
      { wrapper }
    );

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual([{ id: "old", name: "Original" }]);

    await act(async () => resolveRequest());
  });

  it("does not fall back to global ledger invalidation", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => undefined,
          successMessage: null,
          errorMessage: null,
        }),
      { wrapper }
    );

    await act(async () => result.current.mutateAsync());
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates only explicitly affected query predicates", async () => {
    const { invalidate, wrapper } = setup();
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => undefined,
          successMessage: null,
          errorMessage: null,
          invalidatePredicates: [affected],
        }),
      { wrapper }
    );

    await act(async () => result.current.mutateAsync());
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ predicate: affected });
  });

  it("rejects and runs error feedback when the server action fails", async () => {
    const { wrapper } = setup();
    const onErrorExtra = vi.fn();
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => {
            throw new Error("server action failed");
          },
          successMessage: null,
          errorMessage: "Operation failed",
          onErrorExtra,
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow("server action failed");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onErrorExtra).toHaveBeenCalledWith(expect.any(Error), undefined);
    expect(toastErrorMock).toHaveBeenCalledWith("Operation failed");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("still resolves when the server action succeeds but cache invalidation fails", async () => {
    const { queryClient, wrapper } = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRefreshSettled = vi.fn();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockRejectedValue(new Error("refresh failed"));
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
          errorMessage: null,
          invalidatePredicates: [affected],
          onRefreshSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).resolves.toBe("saved");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ predicate: affected });
    await waitFor(() => expect(onRefreshSettled).toHaveBeenCalledTimes(1));
    expect(onRefreshSettled).toHaveBeenCalledWith(
      queryClient,
      undefined,
      expect.objectContaining({ message: "refresh failed" })
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("background cache invalidation failed"),
      expect.objectContaining({ ledgerId: "ledger-1" })
    );
  });

  it("does not repeat success or error callbacks when the background refresh fails", async () => {
    const { queryClient, wrapper } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(new Error("refresh failed"));
    const onSuccessExtra = vi.fn();
    const onErrorExtra = vi.fn();
    const onMutationSettled = vi.fn();
    const onRefreshSettled = vi.fn();
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => undefined,
          successMessage: "Saved",
          errorMessage: "Failed",
          invalidatePredicates: [affected],
          onSuccessExtra,
          onErrorExtra,
          onMutationSettled,
          onRefreshSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(onSuccessExtra).toHaveBeenCalledTimes(1);
    expect(onErrorExtra).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(onMutationSettled).toHaveBeenCalledTimes(1);

    // Let the failed background refresh settle; callbacks must not re-run.
    await waitFor(() => expect(onRefreshSettled).toHaveBeenCalledTimes(1));
    expect(onSuccessExtra).toHaveBeenCalledTimes(1);
    expect(onErrorExtra).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(onMutationSettled).toHaveBeenCalledTimes(1);
    expect(onRefreshSettled).toHaveBeenCalledWith(
      queryClient,
      undefined,
      expect.objectContaining({ message: "refresh failed" })
    );
  });

  it("invokes onMutationSettled on success without waiting for background invalidation", async () => {
    const { queryClient, wrapper } = setup();
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async () => {
      await refreshGate;
    });
    const onMutationSettled = vi.fn();
    const onRefreshSettled = vi.fn();
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
          errorMessage: null,
          invalidatePredicates: [affected],
          onMutationSettled,
          onRefreshSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(onMutationSettled).toHaveBeenCalledTimes(1);
    expect(onMutationSettled).toHaveBeenCalledWith(queryClient, undefined, "saved", null);
    expect(onRefreshSettled).not.toHaveBeenCalled();

    await act(async () => releaseRefresh());
    await waitFor(() => expect(onRefreshSettled).toHaveBeenCalledTimes(1));
    expect(onRefreshSettled).toHaveBeenCalledWith(queryClient, undefined, null);
  });

  it("invokes onMutationSettled on error and never runs the refresh callback", async () => {
    const { queryClient, wrapper } = setup();
    const onMutationSettled = vi.fn();
    const onRefreshSettled = vi.fn();
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => {
            throw new Error("server action failed");
          },
          successMessage: null,
          errorMessage: null,
          invalidatePredicates: [() => false],
          onMutationSettled,
          onRefreshSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow("server action failed");
    });

    expect(onMutationSettled).toHaveBeenCalledTimes(1);
    expect(onMutationSettled).toHaveBeenCalledWith(
      queryClient,
      undefined,
      undefined,
      expect.objectContaining({ message: "server action failed" })
    );
    expect(onRefreshSettled).not.toHaveBeenCalled();
  });
});
