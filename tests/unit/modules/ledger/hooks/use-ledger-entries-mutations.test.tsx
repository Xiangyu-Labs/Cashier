import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";

const { updateLedgerEntryActionMock, deleteLedgerEntryActionMock, toastSuccessMock } = vi.hoisted(
  () => ({
    updateLedgerEntryActionMock: vi.fn(),
    deleteLedgerEntryActionMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  })
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/entries", () => ({
  updateLedgerEntryAction: updateLedgerEntryActionMock,
  deleteLedgerEntryAction: deleteLedgerEntryActionMock,
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useLedgerEntriesMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps update pending until derived queries settle", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    updateLedgerEntryActionMock.mockResolvedValueOnce({ id: "entry-1" });
    const { result } = renderHook(() => useLedgerEntriesMutations("ledger-1"), { wrapper });

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.updateEntry.mutateAsync({
        ledgerEntryId: "entry-1",
        data: { itemName: "Dinner" },
      });
    });

    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledOnce());
    expect(result.current.updateEntry.isPending).toBe(true);

    await act(async () => {
      refreshGate.resolve();
      await mutation;
    });
  });

  it("shows delete success before derived queries settle but remains pending", async () => {
    const { queryClient, wrapper } = setup();
    const refreshGate = deferred();
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(() => refreshGate.promise);
    deleteLedgerEntryActionMock.mockResolvedValueOnce({ sourceDocumentDeleted: false });
    const { result } = renderHook(() => useLedgerEntriesMutations("ledger-1"), { wrapper });

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.deleteEntry.mutateAsync("entry-1");
    });

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("deleteSuccess"));
    expect(result.current.deleteEntry.isPending).toBe(true);

    await act(async () => {
      refreshGate.resolve();
      await mutation;
    });
  });
});
