import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
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
