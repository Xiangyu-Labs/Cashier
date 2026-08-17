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
          resourceGroups: ["credentials"],
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

  it("remains pending until resource invalidation settles", async () => {
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
          resourceGroups: ["credentials"],
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
          resourceGroups: ["credentials"],
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
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("reports a server write failure without invalidating resources", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-1", {
          mutationFn: async () => {
            throw new Error("write failed");
          },
          resourceGroups: ["documents"],
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
    expect(invalidate).not.toHaveBeenCalled();
  });
});
