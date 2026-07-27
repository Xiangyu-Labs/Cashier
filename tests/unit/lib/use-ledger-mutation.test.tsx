import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

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
  it("keeps cached server data unchanged until the request succeeds", async () => {
    const { queryClient, wrapper } = setup();
    const queryKey = ["affected", "ledger-1"] as const;
    queryClient.setQueryData(queryKey, [{ id: "old", name: "Original" }]);
    let resolveRequest!: () => void;
    const request = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    const optimisticUpdate = vi.fn((client: QueryClient) => {
      client.setQueryData(queryKey, [{ id: "new", name: "Optimistic" }]);
    });

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: () => request,
          successMessage: null,
          errorMessage: null,
          onOptimisticUpdate: optimisticUpdate,
        }),
      { wrapper }
    );

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual([{ id: "old", name: "Original" }]);
    expect(optimisticUpdate).not.toHaveBeenCalled();

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
});
