import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

const { toastSuccessMock, toastErrorMock, toastWarningMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, warning: toastWarningMock },
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
    expect(invalidate).toHaveBeenCalledWith({ predicate: affected }, { throwOnError: true });
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
          refreshFailureMessage: "Saved, refresh failed",
          invalidatePredicates: [affected],
          onRefreshSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).resolves.toBe("saved");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ predicate: affected }, { throwOnError: true });
    await waitFor(() => expect(onRefreshSettled).toHaveBeenCalledTimes(1));
    expect(onRefreshSettled).toHaveBeenCalledWith(
      queryClient,
      undefined,
      expect.objectContaining({ message: "refresh failed" })
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("cache refresh failed"),
      expect.objectContaining({ ledgerId: "ledger-1" })
    );
    expect(toastWarningMock).toHaveBeenCalledWith("Saved, refresh failed");
  });

  it("warns when an active query really fails to refetch while keeping the write successful", async () => {
    const { wrapper } = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce("initial")
      .mockRejectedValueOnce(new Error("offline"));
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";

    const { result } = renderHook(
      () => ({
        query: useQuery({ queryKey: ["affected", "ledger-1"], queryFn }),
        mutation: useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
          errorMessage: null,
          refreshFailureMessage: "Saved, refresh failed",
          invalidatePredicates: [affected],
        }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.query.data).toBe("initial"));
    await act(async () => {
      await expect(result.current.mutation.mutateAsync(undefined)).resolves.toBe("saved");
    });

    expect(queryFn).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(toastWarningMock).toHaveBeenCalledWith("Saved, refresh failed");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("cache refresh failed"),
      expect.objectContaining({ ledgerId: "ledger-1" })
    );
  });

  it("does not repeat success or error callbacks when refresh fails", async () => {
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

  it("keeps pending through refresh and runs reconciliation before invalidation", async () => {
    const { queryClient, wrapper } = setup();
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const onMutationSettled = vi.fn();
    const onRefreshSettled = vi.fn();
    const onSuccessExtra = vi.fn();
    const order: string[] = [];
    const onSuccessReconcile = vi.fn(() => {
      order.push("reconcile");
    });
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
      await refreshGate;
    });
    const affected = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "affected";
    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => "saved",
          successMessage: null,
          errorMessage: null,
          invalidatePredicates: [affected],
          onSuccessReconcile,
          onSuccessExtra,
          onMutationSettled,
          onRefreshSettled,
        }),
      { wrapper }
    );

    let mutationPromise!: Promise<string>;
    act(() => {
      mutationPromise = result.current.mutateAsync(undefined);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    await waitFor(() => expect(onSuccessReconcile).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["reconcile", "invalidate"]);
    expect(onSuccessExtra).not.toHaveBeenCalled();
    expect(onMutationSettled).not.toHaveBeenCalled();
    expect(onRefreshSettled).not.toHaveBeenCalled();

    await act(async () => {
      releaseRefresh();
      await mutationPromise;
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(onRefreshSettled).toHaveBeenCalledWith(queryClient, undefined, null);
    expect(onSuccessExtra).toHaveBeenCalledTimes(1);
    expect(onMutationSettled).toHaveBeenCalledWith(queryClient, undefined, "saved", null);
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
